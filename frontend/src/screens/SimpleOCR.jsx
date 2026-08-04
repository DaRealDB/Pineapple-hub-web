import { useState } from 'react';

export default function SimpleOCR() {
  const [imageData, setImageData] = useState(null);
  const [ocrResult, setOcrResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageData(reader.result);
        setOcrResult(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const processOCR = async () => {
    if (!imageData) return;

    setIsProcessing(true);
    setError(null);

    try {
      // Convert base64 to blob
      const response = await fetch(imageData);
      const blob = await response.blob();
      
      // Convert blob to base64 without data URL prefix
      const base64Data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(blob);
      });

      // Call backend OCR API (session_id is optional)
      const ocrResponse = await fetch('http://localhost:8000/api/ocr/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_data: base64Data,
        }),
      });

      if (!ocrResponse.ok) {
        const errorText = await ocrResponse.text();
        throw new Error(`OCR processing failed: ${ocrResponse.status} - ${errorText}`);
      }

      const result = await ocrResponse.json();
      setOcrResult(result);
    } catch (err) {
      setError(err.message);
      console.error('OCR Error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-lg">
      <div className="max-w-4xl mx-auto">
        <h1 className="font-headline-md text-headline-md font-bold text-primary mb-lg">
          Simple OCR Demo
        </h1>

        <div className="grid grid-cols-2 gap-lg">
          {/* Image Upload Section */}
          <div className="bg-surface-container p-md rounded border border-outline-variant">
            <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface mb-md">
              Upload Image
            </h2>
            
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="w-full text-sm text-on-surface-variant file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-on-primary hover:file:bg-primary-container"
            />

            {imageData && (
              <div className="mt-md">
                <img
                  src={imageData}
                  alt="Uploaded"
                  className="w-full h-auto rounded border border-outline-variant"
                />
                <button
                  onClick={processOCR}
                  disabled={isProcessing}
                  className="mt-md w-full bg-primary text-on-primary py-sm px-md rounded font-label-caps text-label-caps hover:bg-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? 'Processing...' : 'Process OCR'}
                </button>
              </div>
            )}
          </div>

          {/* Results Section */}
          <div className="bg-surface-container p-md rounded border border-outline-variant">
            <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface mb-md">
              OCR Results
            </h2>

            {error && (
              <div className="bg-error-container p-sm rounded mb-md">
                <p className="text-on-error-container font-body-md text-body-md">
                  Error: {error}
                </p>
              </div>
            )}

            {ocrResult ? (
              <div className="space-y-sm">
                <div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-xs">
                    Detected Text
                  </p>
                  <p className="font-body-md text-body-md text-on-surface bg-surface-container-low p-sm rounded">
                    {ocrResult.text || 'No text detected'}
                  </p>
                </div>

                <div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-xs">
                    Confidence
                  </p>
                  <p className="font-data-mono text-data-mono text-primary">
                    {ocrResult.confidence ? `${(ocrResult.confidence * 100).toFixed(1)}%` : 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-xs">
                    Processing Time
                  </p>
                  <p className="font-data-mono text-data-mono text-on-surface">
                    {ocrResult.processing_time_ms ? `${ocrResult.processing_time_ms}ms` : 'N/A'}
                  </p>
                </div>

                {ocrResult.is_duplicate && (
                  <div className="bg-tertiary-container p-sm rounded">
                    <p className="text-on-tertiary-container font-body-md text-body-md">
                      ⚠️ Duplicate detected (similarity: {ocrResult.similarity_score?.toFixed(2)})
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="font-body-md text-body-md text-on-surface-variant">
                Upload an image and click "Process OCR" to see results
              </p>
            )}
          </div>
        </div>

        {/* Backend Status */}
        <div className="mt-lg bg-surface-container p-md rounded border border-outline-variant">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface mb-md">
            Backend Status
          </h2>
          <div className="flex items-center gap-xs">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            <span className="font-label-caps text-label-caps text-on-surface-variant">
              Backend Running (http://localhost:8000)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}