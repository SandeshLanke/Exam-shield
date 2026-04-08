import React from 'react';

export const Loading = ({ 
  message = 'Loading...', 
  size = 'medium', // small, medium, large
  fullScreen = false 
}) => {
  if (fullScreen) {
    return (
      <div className="loading-fullscreen">
        <div className="loading-container">
          <div className={`spinner spinner-${size}`}></div>
          <p className="loading-message">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="loading-inline">
      <div className={`spinner spinner-${size}`}></div>
      {message && <span className="loading-message">{message}</span>}
    </div>
  );
};

export default Loading;