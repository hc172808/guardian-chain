package token

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"sync"
	"time"
)

// TokenFactory handles token creation with protocol-enforced rules
type TokenFactory struct {
	mu            sync.RWMutex
	tokens        map[string]*Token
	lpBank        *LiquidityPoolBank
	feeCollector  FeeCollector
	minLiquidity  *big.Int // Minimum GYDS liquidity required
	deploymentFee *big.Int // GYDS fee for deployment
}

// Token represents a user-created token with authorities
type Token struct {
	ID              string         `json:"id"`
	Name            string         `json:"name"`
	Symbol          string         `json:"symbol"`
	Decimals        uint8          `json:"decimals"`
	TotalSupply     *big.Int       `json:"totalSupply"`
	CirculatingSupply *big.Int     `json:"circulatingSupply"`
	BurnedSupply    *big.Int       `json:"burnedSupply"`
	Creator         string         `json:"creator"`
	CreatedAt       time.Time      `json:"createdAt"`
	Metadata        TokenMetadata  `json:"metadata"`
	Authorities     TokenAuthorities `json:"authorities"`
	LPInfo          LPInfo         `json:"lpInfo"`
	IsLocked        bool           `json:"isLocked"` // If true, all authorities permanently revoked
	IsPaused        bool           `json:"isPaused"` // Emergency pause
}

// TokenMetadata contains updateable token information
type TokenMetadata struct {
	Description string `json:"description"`
	LogoURI     string `json:"logoUri"`
	Website     string `json:"website"`
	Social      map[string]string `json:"social"`
}

// TokenAuthorities defines the authority holders for a token
type TokenAuthorities struct {
	Freeze AuthorityInfo `json:"freeze"`
	Update AuthorityInfo `json:"update"`
	Mint   AuthorityInfo `json:"mint"`
}

// AuthorityInfo tracks an individual authority
type AuthorityInfo struct {
	Enabled   bool      `json:"enabled"`
	Holder    string    `json:"holder"`    // Address of authority holder, empty if revoked
	Locked    bool      `json:"locked"`    // If true, permanently revoked
	PaidFee   *big.Int  `json:"paidFee"`   // GYDS paid for this authority
	GrantedAt time.Time `json:"grantedAt"`
}

// LPInfo contains liquidity pool information
type LPInfo struct {
	GYDSLiquidity  *big.Int  `json:"gydsLiquidity"`
	TokenLiquidity *big.Int  `json:"tokenLiquidity"`
	LPTokensBurned bool      `json:"lpTokensBurned"`    // If true, LP is permanently locked
	UnlockTime     time.Time `json:"unlockTime"`        // If not burned, when LP unlocks
	IsLocked       bool      `json:"isLocked"`
}

// CreateTokenRequest contains parameters for creating a new token
type CreateTokenRequest struct {
	Name           string
	Symbol         string
	Decimals       uint8
	InitialSupply  *big.Int
	Creator        string
	Metadata       TokenMetadata
	GYDSLiquidity  *big.Int
	LPBurnOrLock   string    // "burn" or "lock"
	LPLockDuration time.Duration // Only used if LPBurnOrLock is "lock"
	Authorities    AuthorityPurchase
}

// AuthorityPurchase defines which authorities to purchase
type AuthorityPurchase struct {
	PurchaseFreeze bool
	PurchaseUpdate bool
	PurchaseMint   bool
	MintExtraLiquidity *big.Int // Additional liquidity for mint authority
	MintLockDuration   time.Duration // Required lock for mint authority
}

// FeeCollector interface for routing fees
type FeeCollector interface {
	CollectDeploymentFee(from string, amount *big.Int) error
	CollectAuthorityFee(from string, authorityType string, amount *big.Int) error
	RouteFees(burn, treasury, miners *big.Int) error
}

// NewTokenFactory creates a new token factory
func NewTokenFactory(minLiquidity, deploymentFee *big.Int, feeCollector FeeCollector) *TokenFactory {
	return &TokenFactory{
		tokens:        make(map[string]*Token),
		lpBank:        NewLiquidityPoolBank(),
		feeCollector:  feeCollector,
		minLiquidity:  minLiquidity,
		deploymentFee: deploymentFee,
	}
}

// CreateToken creates a new token with protocol-enforced rules
func (tf *TokenFactory) CreateToken(req CreateTokenRequest) (*Token, error) {
	tf.mu.Lock()
	defer tf.mu.Unlock()

	// Validate request
	if err := tf.validateCreateRequest(req); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	// Collect deployment fee
	if err := tf.feeCollector.CollectDeploymentFee(req.Creator, tf.deploymentFee); err != nil {
		return nil, fmt.Errorf("failed to collect deployment fee: %w", err)
	}

	// Generate token ID
	tokenID := tf.generateTokenID(req)

	// Check if token already exists
	if _, exists := tf.tokens[tokenID]; exists {
		return nil, errors.New("token already exists")
	}

	// Create token
	token := &Token{
		ID:                tokenID,
		Name:              req.Name,
		Symbol:            req.Symbol,
		Decimals:          req.Decimals,
		TotalSupply:       new(big.Int).Set(req.InitialSupply),
		CirculatingSupply: new(big.Int), // Starts at 0, tokens go to LP
		BurnedSupply:      new(big.Int),
		Creator:           req.Creator,
		CreatedAt:         time.Now(),
		Metadata:          req.Metadata,
		IsLocked:          false,
		IsPaused:          false,
	}

	// Setup authorities
	if err := tf.setupAuthorities(token, req); err != nil {
		return nil, fmt.Errorf("failed to setup authorities: %w", err)
	}

	// Setup LP
	if err := tf.setupLiquidity(token, req); err != nil {
		return nil, fmt.Errorf("failed to setup liquidity: %w", err)
	}

	// Store token
	tf.tokens[tokenID] = token

	// Route deployment fees (50% burn, 30% treasury, 20% miners)
	burnAmount := new(big.Int).Div(tf.deploymentFee, big.NewInt(2))
	treasuryAmount := new(big.Int).Mul(tf.deploymentFee, big.NewInt(3))
	treasuryAmount.Div(treasuryAmount, big.NewInt(10))
	minerAmount := new(big.Int).Sub(tf.deploymentFee, burnAmount)
	minerAmount.Sub(minerAmount, treasuryAmount)

	if err := tf.feeCollector.RouteFees(burnAmount, treasuryAmount, minerAmount); err != nil {
		// Log error but don't fail token creation
		fmt.Printf("Warning: failed to route fees: %v\n", err)
	}

	return token, nil
}

// validateCreateRequest validates token creation parameters
func (tf *TokenFactory) validateCreateRequest(req CreateTokenRequest) error {
	if req.Name == "" {
		return errors.New("token name is required")
	}
	if len(req.Name) > 64 {
		return errors.New("token name too long (max 64 characters)")
	}
	if req.Symbol == "" {
		return errors.New("token symbol is required")
	}
	if len(req.Symbol) > 10 {
		return errors.New("token symbol too long (max 10 characters)")
	}
	if req.Decimals > 18 {
		return errors.New("decimals cannot exceed 18")
	}
	if req.InitialSupply == nil || req.InitialSupply.Cmp(big.NewInt(0)) <= 0 {
		return errors.New("initial supply must be positive")
	}
	if req.Creator == "" {
		return errors.New("creator address is required")
	}
	if req.GYDSLiquidity == nil || req.GYDSLiquidity.Cmp(tf.minLiquidity) < 0 {
		return fmt.Errorf("minimum GYDS liquidity is %s", tf.minLiquidity.String())
	}
	if req.LPBurnOrLock != "burn" && req.LPBurnOrLock != "lock" {
		return errors.New("LP must be either 'burn' or 'lock'")
	}
	if req.LPBurnOrLock == "lock" && req.LPLockDuration < 30*24*time.Hour {
		return errors.New("minimum LP lock duration is 30 days")
	}
	return nil
}

// generateTokenID creates a unique token ID
func (tf *TokenFactory) generateTokenID(req CreateTokenRequest) string {
	data := fmt.Sprintf("%s:%s:%s:%d", req.Creator, req.Symbol, req.Name, time.Now().UnixNano())
	hash := sha256.Sum256([]byte(data))
	return "0x" + hex.EncodeToString(hash[:20])
}

// setupAuthorities configures token authorities based on purchase request
func (tf *TokenFactory) setupAuthorities(token *Token, req CreateTokenRequest) error {
	now := time.Now()

	// Freeze authority
	if req.Authorities.PurchaseFreeze {
		freezeFee := tf.getAuthorityFee("freeze")
		if err := tf.feeCollector.CollectAuthorityFee(req.Creator, "freeze", freezeFee); err != nil {
			return fmt.Errorf("failed to collect freeze authority fee: %w", err)
		}
		token.Authorities.Freeze = AuthorityInfo{
			Enabled:   true,
			Holder:    req.Creator,
			Locked:    false,
			PaidFee:   freezeFee,
			GrantedAt: now,
		}
	} else {
		token.Authorities.Freeze = AuthorityInfo{
			Enabled: false,
			Locked:  true, // If not purchased, permanently disabled
		}
	}

	// Update authority
	if req.Authorities.PurchaseUpdate {
		updateFee := tf.getAuthorityFee("update")
		if err := tf.feeCollector.CollectAuthorityFee(req.Creator, "update", updateFee); err != nil {
			return fmt.Errorf("failed to collect update authority fee: %w", err)
		}
		token.Authorities.Update = AuthorityInfo{
			Enabled:   true,
			Holder:    req.Creator,
			Locked:    false,
			PaidFee:   updateFee,
			GrantedAt: now,
		}
	} else {
		token.Authorities.Update = AuthorityInfo{
			Enabled: false,
			Locked:  true,
		}
	}

	// Mint authority (requires extra liquidity and time-lock)
	if req.Authorities.PurchaseMint {
		mintFee := tf.getAuthorityFee("mint")
		if err := tf.feeCollector.CollectAuthorityFee(req.Creator, "mint", mintFee); err != nil {
			return fmt.Errorf("failed to collect mint authority fee: %w", err)
		}
		// Validate extra liquidity for mint
		if req.Authorities.MintExtraLiquidity == nil || req.Authorities.MintExtraLiquidity.Cmp(tf.minLiquidity) < 0 {
			return errors.New("mint authority requires additional GYDS liquidity equal to minimum")
		}
		// Validate lock duration
		if req.Authorities.MintLockDuration < 90*24*time.Hour {
			return errors.New("mint authority requires minimum 90 day liquidity lock")
		}
		token.Authorities.Mint = AuthorityInfo{
			Enabled:   true,
			Holder:    req.Creator,
			Locked:    false,
			PaidFee:   mintFee,
			GrantedAt: now,
		}
	} else {
		token.Authorities.Mint = AuthorityInfo{
			Enabled: false,
			Locked:  true,
		}
	}

	return nil
}

// setupLiquidity configures the liquidity pool for the token
func (tf *TokenFactory) setupLiquidity(token *Token, req CreateTokenRequest) error {
	// Calculate token amount for LP (entire initial supply goes to LP)
	tokenAmount := new(big.Int).Set(req.InitialSupply)

	// Determine LP lock settings
	var unlockTime time.Time
	lpBurned := req.LPBurnOrLock == "burn"
	if !lpBurned {
		unlockTime = time.Now().Add(req.LPLockDuration)
	}

	// Create LP info
	token.LPInfo = LPInfo{
		GYDSLiquidity:  new(big.Int).Set(req.GYDSLiquidity),
		TokenLiquidity: tokenAmount,
		LPTokensBurned: lpBurned,
		UnlockTime:     unlockTime,
		IsLocked:       true,
	}

	// Add to LP Bank
	if err := tf.lpBank.DepositLiquidity(token.ID, req.GYDSLiquidity, tokenAmount, lpBurned, unlockTime); err != nil {
		return fmt.Errorf("failed to deposit to LP bank: %w", err)
	}

	// Update circulating supply (tokens in LP are not in circulation)
	token.BurnedSupply = tokenAmount // Tokens sent to LP are "burned" from circulation

	return nil
}

// getAuthorityFee returns the fee for purchasing an authority
func (tf *TokenFactory) getAuthorityFee(authorityType string) *big.Int {
	// Fee structure in GYDS (wei)
	switch authorityType {
	case "freeze":
		return big.NewInt(100e18) // 100 GYDS
	case "update":
		return big.NewInt(50e18) // 50 GYDS
	case "mint":
		return big.NewInt(500e18) // 500 GYDS
	default:
		return big.NewInt(0)
	}
}

// GetToken retrieves a token by ID
func (tf *TokenFactory) GetToken(tokenID string) (*Token, error) {
	tf.mu.RLock()
	defer tf.mu.RUnlock()

	token, exists := tf.tokens[tokenID]
	if !exists {
		return nil, errors.New("token not found")
	}
	return token, nil
}

// LockToken permanently locks all authorities on a token
func (tf *TokenFactory) LockToken(tokenID, caller string) error {
	tf.mu.Lock()
	defer tf.mu.Unlock()

	token, exists := tf.tokens[tokenID]
	if !exists {
		return errors.New("token not found")
	}

	// Only creator can lock
	if token.Creator != caller {
		return errors.New("only creator can lock token")
	}

	// Already locked
	if token.IsLocked {
		return errors.New("token is already locked")
	}

	// Lock all authorities
	token.Authorities.Freeze.Locked = true
	token.Authorities.Freeze.Holder = ""
	token.Authorities.Update.Locked = true
	token.Authorities.Update.Holder = ""
	token.Authorities.Mint.Locked = true
	token.Authorities.Mint.Holder = ""
	token.IsLocked = true

	return nil
}

// RevokeAuthority revokes a specific authority
func (tf *TokenFactory) RevokeAuthority(tokenID, caller, authorityType string) error {
	tf.mu.Lock()
	defer tf.mu.Unlock()

	token, exists := tf.tokens[tokenID]
	if !exists {
		return errors.New("token not found")
	}

	var authority *AuthorityInfo
	switch authorityType {
	case "freeze":
		authority = &token.Authorities.Freeze
	case "update":
		authority = &token.Authorities.Update
	case "mint":
		authority = &token.Authorities.Mint
	default:
		return errors.New("invalid authority type")
	}

	if authority.Locked {
		return errors.New("authority is already locked")
	}
	if authority.Holder != caller {
		return errors.New("only authority holder can revoke")
	}

	authority.Locked = true
	authority.Holder = ""
	authority.Enabled = false

	return nil
}

// TransferAuthority transfers an authority to a new holder
func (tf *TokenFactory) TransferAuthority(tokenID, caller, newHolder, authorityType string) error {
	tf.mu.Lock()
	defer tf.mu.Unlock()

	token, exists := tf.tokens[tokenID]
	if !exists {
		return errors.New("token not found")
	}

	var authority *AuthorityInfo
	switch authorityType {
	case "freeze":
		authority = &token.Authorities.Freeze
	case "update":
		authority = &token.Authorities.Update
	case "mint":
		authority = &token.Authorities.Mint
	default:
		return errors.New("invalid authority type")
	}

	if authority.Locked {
		return errors.New("authority is locked and cannot be transferred")
	}
	if authority.Holder != caller {
		return errors.New("only authority holder can transfer")
	}
	if newHolder == "" {
		return errors.New("new holder address is required")
	}

	authority.Holder = newHolder

	return nil
}

// ListTokens returns all tokens
func (tf *TokenFactory) ListTokens() []*Token {
	tf.mu.RLock()
	defer tf.mu.RUnlock()

	tokens := make([]*Token, 0, len(tf.tokens))
	for _, token := range tf.tokens {
		tokens = append(tokens, token)
	}
	return tokens
}
