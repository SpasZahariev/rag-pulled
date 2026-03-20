import { Upload, MessageSquare, ArrowRight, Database } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export function Home() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3rem)]">
      <main className="flex-1 container mx-auto p-6 max-w-5xl">
        <div className="space-y-16 pb-12">
          
          {/* Hero Section */}
          <div className="relative text-center pt-16 pb-8 px-4 overflow-hidden rounded-xl">
            {/* Decorative Background Shapes */}
            <div className="absolute top-1/2 left-1/2 -translate-x-[120%] -translate-y-1/2 w-48 h-48 bg-primary/20 border-3 border-primary rounded-full -z-10 animate-neo-slide-up" style={{ animationDelay: '0.1s' }} />
            <div className="absolute top-1/2 left-1/2 translate-x-[30%] -translate-y-[80%] w-32 h-32 bg-secondary border-3 border-primary rotate-12 -z-10 animate-neo-slide-up" style={{ animationDelay: '0.2s' }} />
            
            <div className="space-y-6 relative z-10">
              <h1 className="text-7xl md:text-8xl font-black uppercase tracking-tight animate-neo-slide-up" style={{ animationDelay: '0s' }}>
                RagPull
              </h1>
              <p className="text-2xl md:text-3xl font-bold text-primary uppercase tracking-wide animate-neo-slide-up" style={{ animationDelay: '0.1s' }}>
                Upload & Chat
              </p>
              <p className="text-muted-foreground max-w-xl mx-auto text-lg md:text-xl animate-neo-slide-up" style={{ animationDelay: '0.2s' }}>
                Upload your documents and chat with them using AI-powered
                retrieval-augmented generation.
              </p>
            </div>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-neo-slide-up" style={{ animationDelay: '0.3s' }}>
            <div className="border-3 border-foreground bg-card p-8 shadow-[5px_5px_0_0_var(--color-foreground)] flex flex-col hover:-translate-y-1 transition-transform">
              <Upload className="w-10 h-10" />
              <h2 className="text-2xl font-black uppercase mt-4">Upload Data</h2>
              <p className="text-muted-foreground mt-4 flex-1 text-lg">
                Upload CSV, PDF, TXT, and{' '}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-primary font-bold border-b-3 border-primary cursor-help">
                      other
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    <ul className="list-disc pl-3 space-y-0.5 font-normal">
                      <li>.csv</li>
                      <li>.pdf</li>
                      <li>.txt</li>
                      <li>.json</li>
                      <li>.xml</li>
                      <li>.html</li>
                      <li>.md / .markdown</li>
                      <li>.doc / .docx</li>
                      <li>.xls / .xlsx</li>
                    </ul>
                  </TooltipContent>
                </Tooltip>{' '}
                document formats. Your files are processed and indexed for
                intelligent search.
              </p>
              <Button asChild size="lg" className="w-full text-base mt-6">
                <Link to="/upload">
                  Start Uploading
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
            </div>

            <div className="border-3 border-foreground bg-card p-8 shadow-[5px_5px_0_0_var(--color-foreground)] flex flex-col hover:-translate-y-1 transition-transform">
              <MessageSquare className="w-10 h-10" />
              <h2 className="text-2xl font-black uppercase mt-4">RAG Chat</h2>
              <p className="text-muted-foreground mt-4 flex-1 text-lg">
                Ask questions about your uploaded documents. Get AI-generated
                answers grounded in your data with source citations.
              </p>
              <Button asChild size="lg" className="w-full text-base mt-6">
                <Link to="/rag-chat">
                  Start Chatting
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
            </div>
          </div>

          {/* How It Works */}
          <div className="animate-neo-slide-up" style={{ animationDelay: '0.4s' }}>
            <h3 className="text-xl font-black uppercase text-center mb-6">How It Works</h3>
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6">
              
              <div className="w-full md:w-auto flex-1 border-3 border-foreground bg-card p-4 flex items-center gap-4 neo-shadow-sm">
                <div className="bg-primary text-primary-foreground p-2 border-2 border-foreground">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold uppercase text-sm">1. Upload</h4>
                  <p className="text-sm text-muted-foreground">Add your documents</p>
                </div>
              </div>

              <ArrowRight className="w-8 h-8 text-muted-foreground hidden md:block shrink-0" />

              <div className="w-full md:w-auto flex-1 border-3 border-foreground bg-card p-4 flex items-center gap-4 neo-shadow-sm">
                <div className="bg-secondary p-2 border-2 border-foreground">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold uppercase text-sm">2. Index</h4>
                  <p className="text-sm text-muted-foreground">AI processes data</p>
                </div>
              </div>

              <ArrowRight className="w-8 h-8 text-muted-foreground hidden md:block shrink-0" />

              <div className="w-full md:w-auto flex-1 border-3 border-foreground bg-card p-4 flex items-center gap-4 neo-shadow-sm">
                <div className="bg-accent text-accent-foreground p-2 border-2 border-foreground">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold uppercase text-sm">3. Chat</h4>
                  <p className="text-sm text-muted-foreground">Get instant answers</p>
                </div>
              </div>

            </div>
          </div>

          {/* Tech Stack */}
          <div className="text-center pt-8 animate-neo-slide-up" style={{ animationDelay: '0.5s' }}>
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Powered By</p>
            <div className="flex flex-wrap justify-center gap-3">
              {[
                { name: 'React', color: 'bg-sky-200 dark:bg-sky-400/30' },
                { name: 'Tailwind', color: 'bg-cyan-200 dark:bg-cyan-400/30' },
                { name: 'Hono', color: 'bg-orange-200 dark:bg-orange-400/30' },
                { name: 'Supabase', color: 'bg-emerald-200 dark:bg-emerald-400/30' },
                { name: 'Firebase', color: 'bg-amber-200 dark:bg-amber-400/30' },
                { name: 'Gemini', color: 'bg-violet-200 dark:bg-violet-400/30' },
              ].map((tech) => (
                <span 
                  key={tech.name} 
                  className={`border-3 border-foreground px-4 py-1.5 text-xs font-black uppercase tracking-wider neo-shadow-sm ${tech.color}`}
                >
                  {tech.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t-3 border-foreground bg-card py-3 mt-auto shrink-0">
        <div className="container mx-auto px-6 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <span>Built by</span>
          <a
            href="https://github.com/SpasZahariev"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-foreground hover:text-primary transition-colors underline underline-offset-2 decoration-2"
          >
            Spas Zahariev
          </a>
        </div>
      </footer>
    </div>
  );
}
