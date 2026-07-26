import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Leaderboard has been replaced by the Referral Rewards page.
 * This component redirects immediately so any bookmarked or linked /leaderboard URLs still work.
 */
const LeaderboardPage = () => {
  const navigate = useNavigate();
  useEffect(() => { navigate('/referrals', { replace: true }); }, [navigate]);
  return null;
};

export default LeaderboardPage;
