import { useState, useRef, useCallback } from 'react';
import { WEBCAM_CONFIG } from '../utils/constants';

export const useWebcam = () => {
  const [isWebcamReady, setIsWebcamReady] = useState(false);
  const [webcamError, setWebcamError] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const webcamRef = useRef(null);

  // Handle webcam ready
  const handleWebcamReady = useCallback(() => {
    setIsWebcamReady(true);
    setWebcamError(null);
  }, []);

  // Handle webcam error
  const handleWebcamError = useCallback((error) => {
    setIsWebcamReady(false);
    setWebcamError(error.message || 'Failed to access webcam');
    console.error('Webcam error:', error);
  }, []);

  // Capture screenshot from webcam
  const captureScreenshot = useCallback(() => {
    if (!webcamRef.current || !isWebcamReady) {
      return null;
    }

    try {
      const imageSrc = webcamRef.current.getScreenshot();
      return imageSrc;
    } catch (error) {
      console.error('Screenshot capture error:', error);
      return null;
    }
  }, [isWebcamReady]);

  // Start capturing frames at interval
  const startFrameCapture = useCallback((callback, interval = 3000) => {
    setIsCapturing(true);
    
    const captureInterval = setInterval(() => {
      const screenshot = captureScreenshot();
      if (screenshot && callback) {
        callback(screenshot);
      }
    }, interval);

    return captureInterval;
  }, [captureScreenshot]);

  // Stop capturing frames
  const stopFrameCapture = useCallback((intervalId) => {
    setIsCapturing(false);
    if (intervalId) {
      clearInterval(intervalId);
    }
  }, []);

  // Get webcam configuration
  const getWebcamConfig = useCallback(() => {
    return {
      width: WEBCAM_CONFIG.WIDTH,
      height: WEBCAM_CONFIG.HEIGHT,
      facingMode: WEBCAM_CONFIG.FACING_MODE,
      screenshotFormat: WEBCAM_CONFIG.SCREENSHOT_FORMAT,
      screenshotQuality: WEBCAM_CONFIG.SCREENSHOT_QUALITY
    };
  }, []);

  // Check if webcam is available
  const checkWebcamAvailability = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      return videoDevices.length > 0;
    } catch (error) {
      console.error('Error checking webcam availability:', error);
      return false;
    }
  }, []);

  // Request webcam permission
  const requestWebcamPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Stop the stream immediately after getting permission
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('Webcam permission denied:', error);
      setWebcamError('Webcam permission denied');
      return false;
    }
  }, []);

  return {
    webcamRef,
    isWebcamReady,
    webcamError,
    isCapturing,
    handleWebcamReady,
    handleWebcamError,
    captureScreenshot,
    startFrameCapture,
    stopFrameCapture,
    getWebcamConfig,
    checkWebcamAvailability,
    requestWebcamPermission
  };
};

export default useWebcam;