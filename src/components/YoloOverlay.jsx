/**
 * Renders YOLO detection bounding boxes as a CSS overlay on the webcam feed.
 *
 * Coordinates are scaled from backend frame size (640×480) to the
 * displayed container size using percentage positioning — works at
 * any responsive size without JavaScript resize handlers.
 *
 * @param {{ detections: object | null }} props
 */
export default function YoloOverlay({ detections }) {
  if (!detections) return null;

  const { hands = [], boxes = [], primary_box, frame_width = 640, frame_height = 480 } = detections;

  const allDetections = [
    ...boxes.map((d) => ({ ...d, color: 'rgba(16,185,129,0.8)', bg: 'rgba(16,185,129,0.15)', tag: 'CRATE' })),
    ...hands.map((d) => ({ ...d, color: 'rgba(239,68,68,0.8)', bg: 'rgba(239,68,68,0.15)', tag: 'HAND' })),
  ];

  if (allDetections.length === 0 && !primary_box) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {allDetections.map((det, i) => {
        const [x1, y1, x2, y2] = det.bbox;
        const left = (x1 / frame_width) * 100;
        const top = (y1 / frame_height) * 100;
        const width = ((x2 - x1) / frame_width) * 100;
        const height = ((y2 - y1) / frame_height) * 100;
        const isPrimary = primary_box && det.bbox[0] === primary_box.bbox?.[0];

        return (
          <div
            key={i}
            className="absolute border-2 rounded-sm"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
              borderColor: det.color,
              backgroundColor: isPrimary ? det.bg : 'transparent',
              borderWidth: isPrimary ? 3 : 2,
              boxShadow: isPrimary ? `0 0 8px ${det.color}` : 'none',
            }}
          >
            {/* Label */}
            <span
              className="absolute -top-5 left-0 text-[10px] font-bold px-1 rounded whitespace-nowrap"
              style={{ backgroundColor: det.color, color: '#fff' }}
            >
              {det.tag} {det.confidence ? `${(det.confidence * 100).toFixed(0)}%` : ''}
              {isPrimary ? ' ★' : ''}
            </span>
          </div>
        );
      })}

      {/* Primary box highlight */}
      {primary_box && (
        <div
          className="absolute border-2 border-dashed rounded pointer-events-none animate-pulse"
          style={{
            left: `${(primary_box.bbox[0] / frame_width) * 100}%`,
            top: `${(primary_box.bbox[1] / frame_height) * 100}%`,
            width: `${((primary_box.bbox[2] - primary_box.bbox[0]) / frame_width) * 100}%`,
            height: `${((primary_box.bbox[3] - primary_box.bbox[1]) / frame_height) * 100}%`,
            borderColor: 'rgba(6,182,212,0.9)',
          }}
        />
      )}

      {/* Trigger line indicator */}
      <div
        className="absolute top-0 bottom-0 w-0.5 opacity-60"
        style={{ left: '60%', backgroundColor: detections.hands_present ? '#EF4444' : '#94A3B8' }}
      />
    </div>
  );
}
