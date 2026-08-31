/**
 * ChamFlorals Auto Image Compressor
 * Automatically resizes and compresses image files in the browser before upload.
 * Drastically reduces upload time, saves bandwidth, and prevents server payload limit errors.
 */

(function(root) {
  'use strict';

  /**
   * Compress a single image File or Blob
   * @param {File|Blob} file - The original image file
   * @param {Object} [options] - Compression options
   * @param {number} [options.maxWidth=1920] - Maximum width in pixels
   * @param {number} [options.maxHeight=1920] - Maximum height in pixels
   * @param {number} [options.quality=0.82] - JPEG/WebP compression quality (0.0 to 1.0)
   * @param {number} [options.maxSizeBytes=2097152] - Desired maximum file size (default 2MB)
   * @param {string} [options.mimeType] - Output MIME type ('image/jpeg', 'image/webp', etc.)
   * @returns {Promise<File>} - Resolves with compressed File
   */
  async function compressImage(file, options) {
    if (!file || !(file instanceof Blob)) {
      return file;
    }

    const type = file.type || '';
    // If not an image or is SVG, return original
    if (!type.startsWith('image/') || type === 'image/svg+xml') {
      return file;
    }

    // Default configuration
    const opts = Object.assign({
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 0.82,
      maxSizeBytes: 2 * 1024 * 1024,
      mimeType: null
    }, options || {});

    // For GIFs, only compress if larger than 2MB to preserve animations when small
    if (type === 'image/gif' && file.size <= opts.maxSizeBytes) {
      return file;
    }

    try {
      const img = await loadImageElement(file);
      const originalWidth = img.naturalWidth || img.width;
      const originalHeight = img.naturalHeight || img.height;

      if (!originalWidth || !originalHeight) {
        return file;
      }

      // Calculate constrained dimensions preserving aspect ratio
      let targetWidth = originalWidth;
      let targetHeight = originalHeight;

      if (targetWidth > opts.maxWidth || targetHeight > opts.maxHeight) {
        const ratio = Math.min(opts.maxWidth / targetWidth, opts.maxHeight / targetHeight);
        targetWidth = Math.round(targetWidth * ratio);
        targetHeight = Math.round(targetHeight * ratio);
      }

      // If dimensions are within limits and file is already under desired size, return as is
      if (targetWidth === originalWidth && targetHeight === originalHeight && file.size <= opts.maxSizeBytes) {
        return file;
      }

      // Render to canvas
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d', { alpha: true });

      if (!ctx) {
        return file;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Determine output MIME type
      let outputMime = opts.mimeType;
      if (!outputMime) {
        if (type === 'image/webp') {
          outputMime = 'image/webp';
        } else if (type === 'image/png') {
          // If PNG, convert to high-efficiency JPEG with white background for massive size savings
          outputMime = 'image/jpeg';
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, targetWidth, targetHeight);
        } else {
          outputMime = 'image/jpeg';
        }
      }

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      // Convert to blob
      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), outputMime, opts.quality);
      });

      if (!blob) {
        return file;
      }

      // If compressed blob is somehow larger than the original and original was already <= maxSizeBytes, return original
      if (blob.size >= file.size && file.size <= opts.maxSizeBytes) {
        return file;
      }

      // Create a new File object with updated extension if format changed
      let originalName = file.name || 'image.jpg';
      let cleanName = originalName.replace(/\.[^/.]+$/, '');
      let ext = outputMime === 'image/webp' ? '.webp' : (outputMime === 'image/png' ? '.png' : '.jpg');
      let finalName = cleanName + ext;

      const compressedFile = new File([blob], finalName, {
        type: outputMime,
        lastModified: Date.now()
      });

      const oldMB = (file.size / (1024 * 1024)).toFixed(2);
      const newMB = (compressedFile.size / (1024 * 1024)).toFixed(2);
      console.log(`[Auto Image Compressor] Optimized "${file.name}": ${oldMB} MB -> ${newMB} MB (${targetWidth}x${targetHeight})`);

      return compressedFile;
    } catch (err) {
      console.warn('[Auto Image Compressor] Could not compress image, proceeding with original:', err);
      return file;
    }
  }

  /**
   * Helper to load an image from File/Blob into an HTMLImageElement
   * @param {File|Blob} file
   * @returns {Promise<HTMLImageElement>}
   */
  function loadImageElement(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  /**
   * Compress multiple files concurrently
   * @param {FileList|File[]} files
   * @param {Object} [options]
   * @returns {Promise<File[]>}
   */
  async function compressImages(files, options) {
    if (!files || !files.length) return [];
    const list = Array.from(files);
    return Promise.all(list.map((f) => compressImage(f, options)));
  }

  // Export globally
  root.compressImage = compressImage;
  root.compressImages = compressImages;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { compressImage, compressImages };
  }
})(typeof window !== 'undefined' ? window : globalThis);
