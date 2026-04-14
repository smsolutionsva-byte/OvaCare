import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { calculateRisk, type SymptomData, type RiskResult } from "@/lib/riskCalculator";
import RiskMeter from "@/components/RiskMeter";

const defaultData: SymptomData = {
  age: 25, bmi: 22,
  periodRegularity: "regular",
  acne: "none", hairGrowth: "none", hairLoss: "none",
  weightGain: false, fatigue: false, moodSwings: false, darkPatches: false,
  familyHistory: false,
  exercise: "moderate", diet: "balanced",
};

const steps = ["Basic Info", "Symptoms", "Lifestyle", "Results"];

const Predict = () => {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<SymptomData>(defaultData);
  const [result, setResult] = useState<RiskResult | null>(null);

  const set = <K extends keyof SymptomData>(key: K, val: SymptomData[K]) =>
    setData((d) => ({ ...d, [key]: val }));

  const next = () => {
    if (step === 2) {
      setResult(calculateRisk(data));
      setStep(3);
    } else {
      setStep((s) => Math.min(s + 1, 3));
    }
  };
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const RadioOption = ({ name, value, label }: { name: keyof SymptomData; value: string; label: string }) => (
    <div className="flex items-center gap-2">
      <RadioGroupItem value={value} id={`${name}-${value}`} />
      <Label htmlFor={`${name}-${value}`} className="text-sm cursor-pointer">{label}</Label>
    </div>
  );

  const SeverityRadio = ({ name, label }: { name: keyof SymptomData; label: string }) => (
    <div>
      <Label className="mb-2 block text-sm font-medium text-foreground">{label}</Label>
      <RadioGroup value={data[name] as string} onValueChange={(v) => set(name, v as any)} className="flex flex-wrap gap-3">
        {["none", "mild", "moderate", "severe"].map((v) => (
          <RadioOption key={v} name={name} value={v} label={v.charAt(0).toUpperCase() + v.slice(1)} />
        ))}
      </RadioGroup>
    </div>
  );

  const CheckOption = ({ name, label }: { name: keyof SymptomData; label: string }) => (
    <div className="flex items-center gap-3">
      <Checkbox
        id={name}
        checked={data[name] as boolean}
        onCheckedChange={(v) => set(name, !!v as any)}
      />
      <Label htmlFor={name} className="text-sm cursor-pointer">{label}</Label>
    </div>
  );

  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      {/* Steps indicator */}
      <div className="mb-10 flex items-center justify-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
              i <= step ? "gradient-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {i + 1}
            </div>
            <span className="hidden text-xs font-medium text-muted-foreground sm:block">{s}</span>
            {i < steps.length - 1 && <div className={`h-0.5 w-8 rounded ${i < step ? "bg-primary" : "bg-border"}`} />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl border border-border bg-card p-6 shadow-card md:p-8"
        >
          {step === 0 && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-bold text-foreground">Basic Information</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="age">Age</Label>
                  <Input id="age" type="number" min={10} max={60} value={data.age} onChange={(e) => set("age", +e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="bmi">BMI</Label>
                  <Input id="bmi" type="number" step={0.1} min={10} max={50} value={data.bmi} onChange={(e) => set("bmi", +e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="mb-2 block text-sm font-medium">Period Regularity</Label>
                <RadioGroup value={data.periodRegularity} onValueChange={(v) => set("periodRegularity", v as any)} className="flex flex-wrap gap-4">
                  <RadioOption name="periodRegularity" value="regular" label="Regular" />
                  <RadioOption name="periodRegularity" value="irregular" label="Irregular" />
                  <RadioOption name="periodRegularity" value="absent" label="Absent" />
                </RadioGroup>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-bold text-foreground">Symptoms</h2>
              <SeverityRadio name="acne" label="Acne severity" />
              <SeverityRadio name="hairGrowth" label="Excess hair growth (face/body)" />
              <SeverityRadio name="hairLoss" label="Hair thinning / loss" />
              <div className="space-y-3 pt-2">
                <CheckOption name="weightGain" label="Unexplained weight gain" />
                <CheckOption name="fatigue" label="Chronic fatigue" />
                <CheckOption name="moodSwings" label="Frequent mood swings" />
                <CheckOption name="darkPatches" label="Dark patches on skin (neck, armpits)" />
                <CheckOption name="familyHistory" label="Family history of PCOS/PCOD" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-bold text-foreground">Lifestyle</h2>
              <div>
                <Label className="mb-2 block text-sm font-medium">Exercise frequency</Label>
                <RadioGroup value={data.exercise} onValueChange={(v) => set("exercise", v as any)} className="flex flex-wrap gap-4">
                  <RadioOption name="exercise" value="none" label="None" />
                  <RadioOption name="exercise" value="light" label="Light" />
                  <RadioOption name="exercise" value="moderate" label="Moderate" />
                  <RadioOption name="exercise" value="intense" label="Intense" />
                </RadioGroup>
              </div>
              <div>
                <Label className="mb-2 block text-sm font-medium">Diet quality</Label>
                <RadioGroup value={data.diet} onValueChange={(v) => set("diet", v as any)} className="flex flex-wrap gap-4">
                  <RadioOption name="diet" value="balanced" label="Balanced" />
                  <RadioOption name="diet" value="mostly_processed" label="Mostly processed" />
                  <RadioOption name="diet" value="irregular" label="Irregular meals" />
                </RadioGroup>
              </div>
            </div>
          )}

          {step === 3 && result && (
            <div className="space-y-8">
              <div className="text-center">
                <Stethoscope className="mx-auto mb-3 h-8 w-8 text-primary" />
                <h2 className="font-heading text-xl font-bold text-foreground">Your Risk Assessment</h2>
                <p className="mt-1 text-sm text-muted-foreground">Based on your symptom profile</p>
              </div>

              <div className="flex justify-center">
                <RiskMeter score={result.score} level={result.level} />
              </div>

              {result.factors.length > 0 && (
                <div>
                  <h3 className="mb-3 font-heading text-sm font-semibold text-foreground">Contributing Factors</h3>
                  <div className="flex flex-wrap gap-2">
                    {result.factors.map((f) => (
                      <span key={f} className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="mb-3 font-heading text-sm font-semibold text-foreground">Recommendations</h3>
                <ul className="space-y-2">
                  {result.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="rounded-xl bg-muted/50 p-4 text-center text-xs text-muted-foreground">
                ⚠️ This is not a medical diagnosis. Please consult a healthcare professional for proper evaluation.
              </p>
            </div>
          )}

          {/* Navigation */}
          {step < 3 && (
            <div className="mt-8 flex justify-between">
              <Button variant="ghost" onClick={prev} disabled={step === 0}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button className="gradient-primary border-0" onClick={next}>
                {step === 2 ? "Get Results" : "Next"} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="mt-6 flex justify-center">
              <Button variant="outline" onClick={() => { setStep(0); setResult(null); }}>
                Start Over
              </Button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default Predict;
