import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, FileText, Activity, ShieldCheck, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroImg from "@/assets/hero-illustration.png";

const features = [
  {
    icon: Activity,
    title: "Symptom-Based Prediction",
    desc: "Answer a few questions about your symptoms and lifestyle to get an instant risk assessment.",
  },
  {
    icon: FileText,
    title: "Report Analysis",
    desc: "Upload ultrasound or blood test reports and get AI-powered insights in simple language.",
  },
  {
    icon: Brain,
    title: "AI-Powered Insights",
    desc: "Our AI detects key medical terms and highlights abnormalities you should discuss with your doctor.",
  },
  {
    icon: ShieldCheck,
    title: "Private & Secure",
    desc: "Your health data is encrypted and never shared. We prioritize your privacy above all.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
  }),
};

const Landing = () => (
  <div className="gradient-hero min-h-screen">
    {/* Hero */}
    <section className="container mx-auto flex flex-col-reverse items-center gap-8 px-4 pb-16 pt-12 md:flex-row md:gap-16 md:pt-24">
      <motion.div
        className="flex-1 text-center md:text-left"
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
      >
        <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-primary">
          AI-Powered Health Insights
        </span>
        <h1 className="font-heading text-4xl font-extrabold leading-tight text-foreground md:text-5xl lg:text-6xl">
          Early awareness for{" "}
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            PCOS & PCOD
          </span>
        </h1>
        <p className="mt-4 max-w-lg text-lg text-muted-foreground md:text-xl">
          Predict your risk with symptom analysis, upload medical reports for AI interpretation, and take charge of your health journey.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row md:justify-start">
          <Button size="lg" className="gradient-primary border-0 px-8 text-base shadow-soft" asChild>
            <Link to="/predict">
              Start Assessment <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="px-8 text-base" asChild>
            <Link to="/analyze">Upload Report</Link>
          </Button>
        </div>
      </motion.div>

      <motion.div
        className="w-64 flex-shrink-0 md:w-96"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.2 }}
      >
        <img src={heroImg} alt="Women's health illustration" className="w-full drop-shadow-xl" />
      </motion.div>
    </section>

    {/* Features */}
    <section className="container mx-auto px-4 pb-24">
      <h2 className="mb-12 text-center font-heading text-2xl font-bold text-foreground md:text-3xl">
        How OvaCare Helps You
      </h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            className="rounded-2xl border border-border bg-card p-6 shadow-card transition-shadow hover:shadow-elevated"
            custom={i}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-40px" }}
            variants={fadeUp}
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <f.icon className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mb-2 font-heading text-lg font-semibold text-foreground">{f.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>

    {/* CTA */}
    <section className="border-t border-border bg-card/60 py-16">
      <div className="container mx-auto px-4 text-center">
        <h2 className="font-heading text-2xl font-bold text-foreground md:text-3xl">
          We're not replacing doctors
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          We're enabling early awareness, so that medical intervention happens at the right time.
        </p>
        <Button size="lg" className="mt-8 gradient-primary border-0 px-8 shadow-soft" asChild>
          <Link to="/predict">Get Started Free <ArrowRight className="ml-2 h-4 w-4" /></Link>
        </Button>
      </div>
    </section>
  </div>
);

export default Landing;
