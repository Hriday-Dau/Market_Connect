import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import * as auctionAPI from '../../../services/auction';
import './AuctionDetail.css';

const AuctionDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToCart, clearCart } = useCart();
  const [showUpcomingMessage, setShowUpcomingMessage] = useState(false);
  
  const [auction, setAuction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bidAmount, setBidAmount] = useState('');
  const [bidding, setBidding] = useState(false);
  const [bidError, setBidError] = useState('');
  const [bidSuccess, setBidSuccess] = useState('');
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (id) {
      loadAuction();
      const interval = setInterval(loadAuction, 120000);
      return () => clearInterval(interval);
    }
  }, [id]);

  useEffect(() => {
    if (auction?.auctionDetails?.endTime) {
      const timer = setInterval(() => {
        setTimeLeft(formatTimeRemaining(auction.auctionDetails.endTime));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [auction]);

  useEffect(() => {
    if (auction?.auctionDetails?.status === 'Pending') {
      setShowUpcomingMessage(true);
    }
  }, [auction]);

  const loadAuction = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Loading auction with ID:', id);
      const response = await auctionAPI.getAuctionById(id);
      console.log('Auction API response:', response);
      
      if (response && response.success && response.data) {
        console.log('Auction data:', response.data);
        setAuction(response.data);
        // Set suggested bid amount (minimum increment is 50)
        const currentBid = response.data.auctionDetails?.currentBid || response.data.auctionDetails?.startPrice || 0;
        setBidAmount((currentBid + 50).toString());
      } else {
        console.error('Invalid response:', response);
        setError('Auction not found');
      }
    } catch (error) {
      console.error('Error loading auction:', error);
      console.error('Error details:', error.response?.data);
      setError(error.response?.data?.message || 'Failed to load auction details');
    } finally {
      setLoading(false);
    }
  };

  const formatTimeRemaining = (endTime) => {
    const now = new Date();
    const end = new Date(endTime);
    const diff = end - now;

    if (diff <= 0) {
      return 'Auction Ended';
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const handlePlaceBid = async (e) => {
    e.preventDefault();
    
    if (!user) {
      navigate('/login');
      return;
    }

    setBidError('');
    setBidSuccess('');
    setBidding(true);

    try {
      const currentBid = auction.auctionDetails?.currentBid || auction.auctionDetails?.startPrice || 0;
      const bidValue = parseFloat(bidAmount);

      if (bidValue <= currentBid) {
        setBidError(`Bid must be higher than current bid of ₹${currentBid}`);
        return;
      }

      if (bidValue < currentBid + 50) {
        setBidError(`Minimum bid increment is ₹50`);
        return;
      }

      console.log('Placing bid:', { auctionId: id, bidAmount: bidValue });
      const response = await auctionAPI.placeBid(id, bidValue);
      console.log('Bid response:', response);
      
      if (response && response.success) {
        // Refresh auction data to show new bid
        await loadAuction();
        setBidAmount((bidValue + 50).toString()); // Set next suggested bid (minimum increment)
        setBidSuccess(`Bid of ₹${bidValue} placed successfully!`);
        // Clear success message after 5 seconds
        setTimeout(() => setBidSuccess(''), 5000);
      } else {
        console.error('Bid failed:', response);
        setBidError(response?.message || 'Failed to place bid');
      }
    } catch (error) {
      console.error('Error placing bid:', error);
      console.error('Error response:', error.response);
      console.error('Error data:', error.response?.data);
      setBidError(error.response?.data?.message || error.message || 'Failed to place bid');
    } finally {
      setBidding(false);
    }
  };

  if (loading) {
    return (
      <div className="auction-detail">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading auction details...</p>
        </div>
      </div>
    );
  }

  if (error || !auction) {
    return (
      <div className="auction-detail">
        <div className="error-state">
          <h2>Auction Not Found</h2>
          <p>{error || 'The auction you are looking for does not exist.'}</p>
          <button onClick={() => navigate('/auctions')} className="back-btn">
            Back to Auctions
          </button>
        </div>
      </div>
    );
  }

  const currentBid = auction.auctionDetails?.currentBid || auction.auctionDetails?.startPrice || 0;
  const isAuctionActive = auction.auctionDetails?.status === 'Active';
  const isAuctionEnded = new Date() > new Date(auction.auctionDetails?.endTime);
  const isAuctionUpcoming = auction.auctionDetails?.status === 'Pending';
  const isAuctionCompleted = auction.auctionDetails?.status === 'Completed';
  
  const isWinner = () => {
    if (!user || !auction.auctionDetails?.winner) return false;
    return auction.auctionDetails.winner.userId?.toString() === user._id?.toString() ||
           auction.auctionDetails.winner.userId?.toString() === user.id?.toString();
  };

  const handleProceedToPayment = () => {
    // Clear cart and add auction product
    clearCart();
    
    // Add auction product to cart with winning bid price
    const auctionProduct = {
      _id: auction._id,
      title: auction.title,
      price: auction.auctionDetails?.currentBid || auction.auctionDetails?.startPrice,
      images: auction.images,
      stock: 1,
      isAuction: true,
      auctionId: auction._id
    };
    
    addToCart(auctionProduct, 1);
    
    // Navigate to checkout
    navigate('/checkout');
  };

  return (
    <div className="auction-detail">
      <div className="auction-container">
        {/* Back Button */}
        <button onClick={() => navigate('/auctions')} className="back-button">
          ← Back to Auctions
        </button>

        <div className="auction-content">
          {/* Product Images */}
          <div className="auction-images">
            <div className="main-image">
              <img 
                src={auction.images?.[0]?.url || '/placeholder-image.jpg'} 
                alt={auction.title}
                onError={(e) => {
                  e.target.src = '/placeholder-image.jpg';
                }}
              />
              <div className={`auction-status ${isAuctionActive ? 'active' : 'ended'}`}>
                {isAuctionActive && !isAuctionEnded ? 'LIVE AUCTION' : 'AUCTION ENDED'}
              </div>
            </div>
            
            {auction.images && auction.images.length > 1 && (
              <div className="thumbnail-images">
                {auction.images.slice(1, 4).map((image, index) => (
                  <img 
                    key={index}
                    src={image.url} 
                    alt={`${auction.title} ${index + 2}`}
                    onError={(e) => {
                      e.target.src = '/placeholder-image.jpg';
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Auction Info */}
          <div className="auction-info">
            <h1 className="auction-title">{auction.title}</h1>
            
            {auction.description && (
              <p className="auction-description">{auction.description}</p>
            )}

            {/* Seller Information */}
            {auction.sellerId && (
              <div className="seller-info">
                <h3>Seller Information</h3>
                <p className="seller-name">
                  {auction.sellerId.sellerInfo?.shopName || auction.sellerId.name || 'Seller'}
                </p>
              </div>
            )}

            {/* Current Bid Info */}
            <div className="bid-info">
              <div className="current-bid">
                <span className="label">Current Bid</span>
                <span className="amount">₹{currentBid.toLocaleString()}</span>
              </div>
              
              <div className="bid-stats">
                <div className="stat">
                  <span className="value">{auction.auctionDetails?.bidHistory?.length || 0}</span>
                  <span className="label">Bids</span>
                </div>
                <div className="stat">
                  <span className="value">₹{auction.auctionDetails?.startPrice?.toLocaleString()}</span>
                  <span className="label">Starting Price</span>
                </div>
              </div>
            </div>

            {/* Time Remaining */}
            <div className="time-info">
              <span className="time-label">Time Remaining:</span>
              <span className={`time-remaining ${isAuctionEnded ? 'ended' : ''}`}>
                {timeLeft || formatTimeRemaining(auction.auctionDetails?.endTime)}
              </span>
            </div>

            {/* Upcoming Auction Message */}
            {isAuctionUpcoming && (
              <div className="auction-upcoming">
                <h3>Auction Not Started Yet</h3>
                <p className="upcoming-message">
                  This auction will begin on <strong>{new Date(auction.auctionDetails?.startTime).toLocaleString()}</strong>
                </p>
                <p className="upcoming-info">
                  Starting Price: ₹{auction.auctionDetails?.startPrice?.toLocaleString()}
                </p>
              </div>
            )}

            {/* Bidding Form */}
            {isAuctionActive && !isAuctionEnded && !isAuctionUpcoming ? (
              <div className="bidding-section">
                <form onSubmit={handlePlaceBid} className="bid-form">
                  <div className="bid-input-group">
                    <label htmlFor="bidAmount">Your Bid (₹)</label>
                    <input
                      type="number"
                      id="bidAmount"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      min={currentBid + 50}
                      step="50"
                      required
                      disabled={bidding}
                      placeholder={`Minimum: ₹${currentBid + 50}`}
                    />
                  </div>
                  
                  {bidError && (
                    <div className="bid-error">{bidError}</div>
                  )}
                  
                  {bidSuccess && (
                    <div className="bid-success">{bidSuccess}</div>
                  )}
                  
                  <button 
                    type="submit" 
                    className="place-bid-btn"
                    disabled={bidding || !user}
                  >
                    {bidding ? 'Placing Bid...' : 'Place Bid'}
                  </button>
                  
                  {!user && (
                    <p className="login-prompt">
                      <button 
                        type="button" 
                        onClick={() => navigate('/login')}
                        className="login-link"
                      >
                        Login to place a bid
                      </button>
                    </p>
                  )}
                </form>
              </div>
            ) : null}

            {/* Auction Ended */}
            {(isAuctionEnded || isAuctionCompleted) && !isAuctionUpcoming && (
              <div className="auction-ended">
                <h3>Auction Ended</h3>
                {auction.auctionDetails?.winner ? (
                  <>
                    {!isWinner() && (
                      <p>Winner: {auction.auctionDetails.winner.name || 'Anonymous'}</p>
                    )}
                    {isWinner() && (
                      <button 
                        className="proceed-payment-btn"
                        onClick={handleProceedToPayment}
                      >
                        Proceed to Payment
                      </button>
                    )}
                  </>
                ) : (
                  <p>No bids were placed on this auction.</p>
                )}
              </div>
            )}

            {/* Product Details */}
            <div className="product-details">
              <h3>Product Details</h3>
              <div className="details-grid">
                <div className="detail-item">
                  <span className="detail-label">Condition:</span>
                  <span className="detail-value">{auction.condition || 'Not specified'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Category:</span>
                  <span className="detail-value">{auction.categoryId?.name || 'Not specified'}</span>
                </div>
                {auction.specs && Object.keys(auction.specs).length > 0 && (
                  <>
                    {Object.entries(auction.specs).map(([key, value]) => (
                      <div key={key} className="detail-item">
                        <span className="detail-label">{key}:</span>
                        <span className="detail-value">{value}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Bid History */}
            {auction.auctionDetails?.bidHistory && auction.auctionDetails.bidHistory.length > 0 && (
              <div className="bid-history">
                <h3>Recent Bids</h3>
                <div className="bid-list">
                  {auction.auctionDetails.bidHistory
                    .slice(-5)
                    .reverse()
                    .map((bid, index) => (
                      <div key={index} className="bid-item">
                        <span className="bid-amount">₹{bid.amount?.toLocaleString()}</span>
                        <span className="bid-time">
                          {new Date(bid.timestamp).toLocaleString()}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuctionDetail;