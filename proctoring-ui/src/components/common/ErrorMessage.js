import React from 'react';

export const ErrorMessage = ({ 
  message, 
  onClose,
  type = 'error' // error, warning, info, success
}) => {
  if (!message) return null;

  return (
    <div className={`alert alert-${type}`}>
      <span className="alert-icon">
        {type === 'error' && '❌'}
        {type === 'warning' && '⚠️'}
        {type === 'info' && 'ℹ️'}
        {type === 'success' && '✅'}
      </span>
      <span className="alert-message">{message}</span>
      {onClose && (
        <button className="alert-close" onClick={onClose}>
          ×
        </button>
      )}
    </div>
  );
};

export default ErrorMessage;