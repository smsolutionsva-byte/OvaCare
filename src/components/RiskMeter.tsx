import { motion } from "framer-motion";

interface RiskMeterProps {
  score: number; // 0-100
  level: "low" | "moderate" | "high";
}

const RiskMeter = ({ score, level }: RiskMeterProps) => {
  const colorMap = {
    low: "risk-low",
    moderate: "risk-moderate",
    high: "risk-high",
  };

  const labelMap = {
    low: "Low Risk",
    moderate: "Moderate Risk",
    high: "High Risk",
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-40 w-40">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60" cy="60" r="52"
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth="12"
          />
          <motion.circle
            cx="60" cy="60" r="52"
            fill="none"
            stroke={
              level === "low" ? "hsl(142, 70%, 45%)" :
              level === "moderate" ? "hsl(45, 90%, 51%)" :
              "hsl(0, 72%, 51%)"
            }
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 52}`}
            initial={{ strokeDashoffset: 2 * Math.PI * 52 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - score / 100) }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="font-heading text-3xl font-bold text-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {score}%
          </motion.span>
        </div>
      </div>
      <span className={`inline-block rounded-full px-4 py-1.5 text-sm font-semibold text-primary-foreground ${colorMap[level]}`}>
        {labelMap[level]}
      </span>
    </div>
  );
};

export default RiskMeter;
