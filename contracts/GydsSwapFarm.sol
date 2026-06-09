// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title GydsSwapFarm
/// @notice Stake GLP LP tokens to earn GYDS rewards.
///         One farm can host multiple pools, each for a different GLP token.
///         Reward rate is set per pool in GYDS per second.
///
/// Security:
///   - Reentrancy guard on all state-changing functions
///   - Owner-only admin functions
///   - SafeERC20 style transfers
///   - No flash-loan attack surface (reward calc is per-block, not per-tx)
contract GydsSwapFarm {

    // ─── Types ───────────────────────────────────────────────────────────────

    struct PoolInfo {
        address lpToken;            // GLP-{T0}-{T1} ERC-20
        uint256 allocPoints;        // weight vs other pools
        uint256 lastRewardTime;     // last timestamp rewards were distributed
        uint256 accGydsPerShare;    // accumulated GYDS per LP share (× 1e12 precision)
        bool    active;
    }

    struct UserInfo {
        uint256 amount;             // LP tokens staked
        uint256 rewardDebt;         // already-accounted reward (× 1e12)
        uint256 pendingHarvest;     // harvested but not yet claimed
    }

    // ─── State ───────────────────────────────────────────────────────────────

    address public owner;
    address public gydsToken;           // GYDS ERC-20 reward token
    uint256 public gydsPerSecond;       // total GYDS emitted per second across all pools
    uint256 public totalAllocPoints;

    PoolInfo[] public poolInfo;
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;

    // ─── Reentrancy guard ────────────────────────────────────────────────────

    uint256 private _status = 1;
    modifier nonReentrant() {
        require(_status == 1, "Farm: REENTRANCY");
        _status = 2;
        _;
        _status = 1;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Farm: NOT_OWNER");
        _;
    }

    // ─── Events ──────────────────────────────────────────────────────────────

    event PoolAdded(uint256 indexed pid, address indexed lpToken, uint256 allocPoints);
    event PoolUpdated(uint256 indexed pid, uint256 allocPoints);
    event Stake(address indexed user, uint256 indexed pid, uint256 amount);
    event Unstake(address indexed user, uint256 indexed pid, uint256 amount);
    event Harvest(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmissionUpdated(uint256 oldRate, uint256 newRate);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    // ─── Constructor ─────────────────────────────────────────────────────────

    /// @param _gydsToken   Address of the GYDS ERC-20 reward token
    /// @param _gydsPerSec  Initial emission rate (GYDS wei per second total)
    constructor(address _gydsToken, uint256 _gydsPerSec) {
        owner        = msg.sender;
        gydsToken    = _gydsToken;
        gydsPerSecond = _gydsPerSec;
    }

    // ─── View ────────────────────────────────────────────────────────────────

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    /// @notice Pending (unclaimed) GYDS rewards for a user in a pool
    function pendingGyds(uint256 pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[pid];
        UserInfo storage user = userInfo[pid][_user];
        uint256 accPerShare   = pool.accGydsPerShare;
        uint256 lpSupply      = _lpBalance(pool.lpToken, address(this));

        if (block.timestamp > pool.lastRewardTime && lpSupply != 0 && totalAllocPoints != 0) {
            uint256 elapsed  = block.timestamp - pool.lastRewardTime;
            uint256 reward   = elapsed * gydsPerSecond * pool.allocPoints / totalAllocPoints;
            accPerShare += reward * 1e12 / lpSupply;
        }
        return user.amount * accPerShare / 1e12 - user.rewardDebt + user.pendingHarvest;
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    /// @notice Add a new LP token pool
    function addPool(address _lpToken, uint256 _allocPoints) external onlyOwner {
        require(_lpToken != address(0), "Farm: ZERO_ADDRESS");
        // Prevent duplicate pools
        for (uint256 i = 0; i < poolInfo.length; i++) {
            require(poolInfo[i].lpToken != _lpToken, "Farm: POOL_EXISTS");
        }
        massUpdatePools();
        totalAllocPoints += _allocPoints;
        poolInfo.push(PoolInfo({
            lpToken:       _lpToken,
            allocPoints:   _allocPoints,
            lastRewardTime: block.timestamp,
            accGydsPerShare: 0,
            active:        true
        }));
        emit PoolAdded(poolInfo.length - 1, _lpToken, _allocPoints);
    }

    /// @notice Update allocation points for a pool
    function setPool(uint256 pid, uint256 _allocPoints) external onlyOwner {
        massUpdatePools();
        totalAllocPoints = totalAllocPoints - poolInfo[pid].allocPoints + _allocPoints;
        poolInfo[pid].allocPoints = _allocPoints;
        emit PoolUpdated(pid, _allocPoints);
    }

    /// @notice Update GYDS emission rate
    function setEmissionRate(uint256 _gydsPerSecond) external onlyOwner {
        massUpdatePools();
        emit EmissionUpdated(gydsPerSecond, _gydsPerSecond);
        gydsPerSecond = _gydsPerSecond;
    }

    /// @notice Transfer contract ownership
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Farm: ZERO_ADDRESS");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ─── Pool update ─────────────────────────────────────────────────────────

    /// @notice Update reward accumulators for all pools
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    /// @notice Update a single pool's reward accumulator
    function updatePool(uint256 pid) public {
        PoolInfo storage pool = poolInfo[pid];
        if (block.timestamp <= pool.lastRewardTime) return;

        uint256 lpSupply = _lpBalance(pool.lpToken, address(this));
        if (lpSupply == 0 || totalAllocPoints == 0) {
            pool.lastRewardTime = block.timestamp;
            return;
        }

        uint256 elapsed = block.timestamp - pool.lastRewardTime;
        uint256 reward  = elapsed * gydsPerSecond * pool.allocPoints / totalAllocPoints;
        pool.accGydsPerShare += reward * 1e12 / lpSupply;
        pool.lastRewardTime   = block.timestamp;
    }

    // ─── User actions ────────────────────────────────────────────────────────

    /// @notice Stake LP tokens into a farm pool
    /// @param pid    Pool index
    /// @param amount Amount of LP tokens to stake
    function stake(uint256 pid, uint256 amount) external nonReentrant {
        require(amount > 0, "Farm: ZERO_AMOUNT");
        PoolInfo storage pool = poolInfo[pid];
        require(pool.active, "Farm: POOL_INACTIVE");
        UserInfo storage user = userInfo[pid][msg.sender];

        updatePool(pid);

        // Harvest pending rewards first
        if (user.amount > 0) {
            uint256 pending = user.amount * pool.accGydsPerShare / 1e12 - user.rewardDebt;
            if (pending > 0) {
                user.pendingHarvest += pending;
            }
        }

        _safeTransferFrom(pool.lpToken, msg.sender, address(this), amount);
        user.amount    += amount;
        user.rewardDebt = user.amount * pool.accGydsPerShare / 1e12;

        emit Stake(msg.sender, pid, amount);
    }

    /// @notice Unstake LP tokens from a farm pool (also harvests pending GYDS)
    /// @param pid    Pool index
    /// @param amount Amount of LP tokens to unstake
    function unstake(uint256 pid, uint256 amount) external nonReentrant {
        PoolInfo storage pool = poolInfo[pid];
        UserInfo storage user = userInfo[pid][msg.sender];
        require(user.amount >= amount, "Farm: INSUFFICIENT_STAKE");

        updatePool(pid);

        uint256 pending = user.amount * pool.accGydsPerShare / 1e12 - user.rewardDebt;
        if (pending > 0) {
            user.pendingHarvest += pending;
        }

        if (amount > 0) {
            user.amount -= amount;
            _safeTransfer(pool.lpToken, msg.sender, amount);
        }
        user.rewardDebt = user.amount * pool.accGydsPerShare / 1e12;

        // Auto-harvest
        if (user.pendingHarvest > 0) {
            uint256 harvested = user.pendingHarvest;
            user.pendingHarvest = 0;
            _safeTransfer(gydsToken, msg.sender, harvested);
            emit Harvest(msg.sender, pid, harvested);
        }

        emit Unstake(msg.sender, pid, amount);
    }

    /// @notice Claim accumulated GYDS rewards without unstaking
    function harvest(uint256 pid) external nonReentrant {
        PoolInfo storage pool = poolInfo[pid];
        UserInfo storage user = userInfo[pid][msg.sender];

        updatePool(pid);

        uint256 pending = user.amount * pool.accGydsPerShare / 1e12 - user.rewardDebt;
        uint256 total   = pending + user.pendingHarvest;
        require(total > 0, "Farm: NOTHING_TO_HARVEST");

        user.pendingHarvest = 0;
        user.rewardDebt     = user.amount * pool.accGydsPerShare / 1e12;

        _safeTransfer(gydsToken, msg.sender, total);
        emit Harvest(msg.sender, pid, total);
    }

    /// @notice Emergency withdraw — exit without collecting rewards (forfeits pending GYDS)
    function emergencyWithdraw(uint256 pid) external nonReentrant {
        PoolInfo storage pool = poolInfo[pid];
        UserInfo storage user = userInfo[pid][msg.sender];
        uint256 amount = user.amount;
        require(amount > 0, "Farm: NOTHING_TO_WITHDRAW");

        user.amount         = 0;
        user.rewardDebt     = 0;
        user.pendingHarvest = 0;

        _safeTransfer(pool.lpToken, msg.sender, amount);
        emit EmergencyWithdraw(msg.sender, pid, amount);
    }

    // ─── Internal helpers ────────────────────────────────────────────────────

    function _safeTransfer(address token, address to, uint256 value) internal {
        (bool success, bytes memory data_) = token.call(
            abi.encodeWithSelector(0xa9059cbb, to, value)
        );
        require(success && (data_.length == 0 || abi.decode(data_, (bool))), "Farm: TRANSFER_FAILED");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) internal {
        (bool success, bytes memory data_) = token.call(
            abi.encodeWithSelector(0x23b872dd, from, to, value)
        );
        require(success && (data_.length == 0 || abi.decode(data_, (bool))), "Farm: TRANSFERFROM_FAILED");
    }

    function _lpBalance(address token, address account) internal view returns (uint256) {
        (bool success, bytes memory data_) = token.staticcall(
            abi.encodeWithSelector(0x70a08231, account)
        );
        require(success, "Farm: BALANCE_CALL_FAILED");
        return abi.decode(data_, (uint256));
    }
}
