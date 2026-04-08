import { useState, useEffect, useRef } from 'react';

export const useTimer = (initialTime, onTimeUp) => {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef(null);

  // Start timer
  const start = () => {
    setIsRunning(true);
  };

  // Pause timer
  const pause = () => {
    setIsRunning(false);
  };

  // Reset timer
  const reset = (newTime = initialTime) => {
    setIsRunning(false);
    setTimeLeft(newTime);
  };

  // Stop timer
  const stop = () => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  };

  // Format time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get time in different formats
  const getTimeDisplay = () => {
    return formatTime(timeLeft);
  };

  const getMinutes = () => {
    return Math.floor(timeLeft / 60);
  };

  const getSeconds = () => {
    return timeLeft % 60;
  };

  const getPercentage = () => {
    return ((initialTime - timeLeft) / initialTime) * 100;
  };

  // Check if time is running low (last 5 minutes)
  const isTimeRunningLow = () => {
    return timeLeft <= 300 && timeLeft > 0;
  };

  // Check if time is critically low (last minute)
  const isTimeCritical = () => {
    return timeLeft <= 60 && timeLeft > 0;
  };

  // Effect to handle countdown
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prevTime) => {
          if (prevTime <= 1) {
            setIsRunning(false);
            if (onTimeUp) {
              onTimeUp();
            }
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, timeLeft, onTimeUp]);

  return {
    timeLeft,
    isRunning,
    start,
    pause,
    reset,
    stop,
    getTimeDisplay,
    getMinutes,
    getSeconds,
    getPercentage,
    isTimeRunningLow,
    isTimeCritical,
    formatTime
  };
};

export default useTimer;