import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

/**
 * ImageCropModal
 * Allows interactive pan, zoom, alignment and crop of uploaded bank logos / avatars.
 * Produces clean PNG dataUrl output within the target dimensions.
 */
export function ImageCropModal({
  open,
  imageSrc,
  onClose,
  onCropComplete,
  title = 'Crop & Align Logo',
  aspectRatio = 1, // 1:1 square or null for freeform
  outputWidth = 400,
  outputHeight = 400,
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imgLoaded, setImgLoaded] = useState(false);

  const containerRef = useRef(null);
  const imageRef = useRef(null);

  // Reset viewport when new image opened
  useEffect(() => {
    if (open && imageSrc) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      setImgLoaded(false);
    }
  }, [open, imageSrc]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: touch.clientX - offset.x, y: touch.clientY - offset.y });
    }
  };

  const handleTouchMove = useCallback((e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setOffset({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove]);

  // Center alignment preset
  const handleCenter = () => {
    setOffset({ x: 0, y: 0 });
  };

  // Perform canvas crop
  const handleApply = () => {
    if (!imageRef.current || !containerRef.current) return;
    const img = imageRef.current;
    const container = containerRef.current;

    const cropBox = container.getBoundingClientRect();
    const imgBox = img.getBoundingClientRect();

    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate source rect on the original image
    const naturalRatioX = img.naturalWidth / imgBox.width;
    const naturalRatioY = img.naturalHeight / imgBox.height;

    const srcX = (cropBox.left - imgBox.left) * naturalRatioX;
    const srcY = (cropBox.top - imgBox.top) * naturalRatioY;
    const srcWidth = cropBox.width * naturalRatioX;
    const srcHeight = cropBox.height * naturalRatioY;

    // Clear background
    ctx.clearRect(0, 0, outputWidth, outputHeight);

    // Draw the cropped portion to canvas
    ctx.drawImage(
      img,
      srcX,
      srcY,
      srcWidth,
      srcHeight,
      0,
      0,
      outputWidth,
      outputHeight
    );

    const croppedDataUrl = canvas.toDataURL('image/png');
    onCropComplete(croppedDataUrl);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleApply}>Save Cropped Logo</Button>
        </>
      }
    >
      <div className="crop-modal-content">
        <p className="crop-modal-instructions">
          Drag to reposition and align. Use the zoom slider to scale the logo inside the crop frame.
        </p>

        {/* Viewport Frame */}
        <div className="crop-stage">
          <div
            ref={containerRef}
            className="crop-box"
            style={{
              aspectRatio: String(aspectRatio || '1'),
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >
            {imageSrc && (
              <img
                ref={imageRef}
                src={imageSrc}
                alt="Crop preview"
                className="crop-target-img"
                draggable={false}
                onLoad={() => setImgLoaded(true)}
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                  cursor: isDragging ? 'grabbing' : 'grab',
                }}
              />
            )}
            <div className="crop-grid-overlay" aria-hidden="true">
              <span className="crop-grid-line crop-grid-h1" />
              <span className="crop-grid-line crop-grid-h2" />
              <span className="crop-grid-line crop-grid-v1" />
              <span className="crop-grid-line crop-grid-v2" />
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="crop-controls">
          <div className="crop-zoom-group">
            <label className="crop-control-label" htmlFor="crop-zoom">Zoom</label>
            <input
              id="crop-zoom"
              type="range"
              min="0.5"
              max="3"
              step="0.05"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="crop-slider"
            />
            <span className="crop-zoom-value">{Math.round(scale * 100)}%</span>
          </div>

          <div className="crop-action-group">
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleCenter}>
              Reset Center
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setScale(1)}>
              100%
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setScale((s) => Math.min(3, s + 0.2))}>
              + Zoom
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}>
              - Zoom
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
