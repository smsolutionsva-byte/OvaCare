import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Upload, FileText, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const Analyze = () => {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const { toast } = useToast();

  const accept = ["application/pdf", "image/jpeg", "image/png"];

  const handleFile = useCallback((f: File) => {
    if (!accept.includes(f.type)) {
      toast({ title: "Unsupported file", description: "Please upload a PDF, JPG, or PNG file.", variant: "destructive" });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 10 MB.", variant: "destructive" });
      return;
    }
    setFile(f);
  }, [toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleAnalyze = () => {
    toast({
      title: "Coming soon!",
      description: "AI report analysis requires backend setup. Enable Lovable Cloud to unlock this feature.",
    });
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <FileText className="h-7 w-7 text-primary" />
        </div>
        <h1 className="font-heading text-2xl font-bold text-foreground md:text-3xl">Report Analyzer</h1>
        <p className="mt-2 text-muted-foreground">
          Upload your ultrasound or blood test report for AI-powered analysis
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card p-6 shadow-card md:p-8"
      >
        {!file ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
            }`}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
            <p className="mb-1 text-sm font-medium text-foreground">
              Drag & drop your report here
            </p>
            <p className="text-xs text-muted-foreground">
              PDF, JPG, PNG — up to 10 MB
            </p>
            <input
              id="file-input"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-4 rounded-xl bg-secondary p-4">
              <FileText className="h-8 w-8 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
              <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <Button className="w-full gradient-primary border-0 shadow-soft" size="lg" onClick={handleAnalyze}>
              Analyze Report
            </Button>
          </div>
        )}

        <div className="mt-6 flex items-start gap-2 rounded-xl bg-muted/50 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Your reports are processed securely and never stored permanently. This tool provides insights only — always consult your doctor for diagnosis.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Analyze;
