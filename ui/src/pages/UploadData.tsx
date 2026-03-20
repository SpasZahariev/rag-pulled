import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Upload, FileText, X, Loader2, CheckCircle2, AlertCircle, Clock, Database, XCircle, FileWarning, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type UploadFilesResponse, type UploadJobStatusResponse } from '@/lib/serverComm';

const ACCEPTED_EXTENSIONS = '.csv,.pdf,.txt,.json,.xml,.html,.md,.markdown,.doc,.docx,.xls,.xlsx';
const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed']);

function getStatusBadge(status: string | undefined) {
  switch (status) {
    case 'queued':
      return <div className="border-3 border-foreground bg-amber-200 dark:bg-amber-400/30 px-3 py-1.5 text-xs font-black uppercase tracking-wider neo-shadow-sm flex items-center gap-2 w-max"><Clock className="w-4 h-4" /> Queued</div>;
    case 'processing_structure':
      return <div className="border-3 border-foreground bg-sky-200 dark:bg-sky-400/30 px-3 py-1.5 text-xs font-black uppercase tracking-wider neo-shadow-sm flex items-center gap-2 w-max"><Loader2 className="w-4 h-4 animate-spin" /> Structuring</div>;
    case 'processing_embeddings':
      return <div className="border-3 border-foreground bg-violet-200 dark:bg-violet-400/30 px-3 py-1.5 text-xs font-black uppercase tracking-wider neo-shadow-sm flex items-center gap-2 w-max"><Loader2 className="w-4 h-4 animate-spin" /> Embedding</div>;
    case 'completed':
      return <div className="border-3 border-foreground bg-emerald-200 dark:bg-emerald-400/30 px-3 py-1.5 text-xs font-black uppercase tracking-wider neo-shadow-sm flex items-center gap-2 w-max"><CheckCircle2 className="w-4 h-4" /> Completed</div>;
    case 'failed':
      return <div className="border-3 border-foreground bg-destructive/20 px-3 py-1.5 text-xs font-black uppercase tracking-wider neo-shadow-sm flex items-center gap-2 w-max"><AlertCircle className="w-4 h-4 text-destructive" /> Failed</div>;
    default:
      return <div className="border-3 border-foreground bg-muted px-3 py-1.5 text-xs font-black uppercase tracking-wider neo-shadow-sm flex items-center gap-2 w-max">Unknown</div>;
  }
}

function getDocStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <div className="border-2 border-foreground bg-amber-200 dark:bg-amber-400/30 px-2 py-0.5 text-[10px] font-black uppercase shadow-[2px_2px_0_0_var(--color-foreground)] flex items-center gap-1 w-max"><Clock className="w-3 h-3" /> Pending</div>;
    case 'processing':
      return <div className="border-2 border-foreground bg-sky-200 dark:bg-sky-400/30 px-2 py-0.5 text-[10px] font-black uppercase shadow-[2px_2px_0_0_var(--color-foreground)] flex items-center gap-1 w-max"><Loader2 className="w-3 h-3 animate-spin" /> Processing</div>;
    case 'structured':
      return <div className="border-2 border-foreground bg-emerald-200 dark:bg-emerald-400/30 px-2 py-0.5 text-[10px] font-black uppercase shadow-[2px_2px_0_0_var(--color-foreground)] flex items-center gap-1 w-max"><CheckCircle2 className="w-3 h-3" /> Structured</div>;
    case 'unsupported':
      return <div className="border-2 border-foreground bg-muted px-2 py-0.5 text-[10px] font-black uppercase shadow-[2px_2px_0_0_var(--color-foreground)] flex items-center gap-1 w-max"><FileWarning className="w-3 h-3" /> Unsupported</div>;
    case 'failed':
      return <div className="border-2 border-foreground bg-destructive/20 px-2 py-0.5 text-[10px] font-black uppercase shadow-[2px_2px_0_0_var(--color-foreground)] flex items-center gap-1 w-max"><AlertCircle className="w-3 h-3 text-destructive" /> Failed</div>;
    default:
      return <div className="border-2 border-foreground bg-muted px-2 py-0.5 text-[10px] font-black uppercase shadow-[2px_2px_0_0_var(--color-foreground)] flex items-center gap-1 w-max">Unknown</div>;
  }
}

export function UploadData() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadFilesResponse | null>(null);
  const [jobStatus, setJobStatus] = useState<UploadJobStatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const formatChips = ['CSV', 'PDF', 'TXT', 'JSON', 'XML', 'HTML', 'MD', 'DOCX', 'XLSX'];

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files || []);
    setSelectedFiles((currentFiles) => [...currentFiles, ...nextFiles]);
    event.target.value = '';
    setUploadResult(null);
    setJobStatus(null);
    setErrorMessage('');
  };

  const removeFile = (indexToRemove: number) => {
    setSelectedFiles((currentFiles) =>
      currentFiles.filter((_, currentIndex) => currentIndex !== indexToRemove)
    );
  };

  const resetSelection = () => {
    setSelectedFiles([]);
    setUploadResult(null);
    setJobStatus(null);
    setErrorMessage('');
  };

  useEffect(() => {
    if (!uploadResult?.jobId) {
      return;
    }
    const currentJobId = uploadResult.jobId;

    let isCancelled = false;
    let pollHandle: ReturnType<typeof setInterval> | null = null;

    const pollStatus = async () => {
      try {
        const statusResponse = await api.getUploadJobStatus(currentJobId);
        if (isCancelled) {
          return;
        }

        setJobStatus(statusResponse);
        if (TERMINAL_JOB_STATUSES.has(statusResponse.status)) {
          if (pollHandle) {
            clearInterval(pollHandle);
            pollHandle = null;
          }
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Failed to fetch processing status.'
          );
        }
      }
    };

    void pollStatus();
    pollHandle = setInterval(() => {
      void pollStatus();
    }, 2000);

    return () => {
      isCancelled = true;
      if (pollHandle) {
        clearInterval(pollHandle);
      }
    };
  }, [uploadResult?.jobId]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (selectedFiles.length === 0) {
      setErrorMessage('Select at least one file before uploading.');
      return;
    }

    try {
      setIsUploading(true);
      setUploadResult(null);
      setJobStatus(null);
      setErrorMessage('');

      const formData = new FormData();
      for (const file of selectedFiles) {
        formData.append('files', file);
      }

      const response = await api.uploadFiles(formData);
      setUploadResult(response);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to upload files.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const isUploadComplete = !!uploadResult;
  const isProcessingActive = isUploadComplete && !TERMINAL_JOB_STATUSES.has(jobStatus?.status || '');
  const isProcessComplete = jobStatus?.status === 'completed';
  const isJobFailed = jobStatus?.status === 'failed';

  return (
    <div className="container mx-auto p-6 max-w-4xl pb-16">
      
      {/* 1. Header */}
      <div className="relative pt-8 pb-8 overflow-hidden mb-6">
        <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-primary/20 border-3 border-primary rotate-12 -z-10 animate-neo-slide-up" style={{ animationDelay: '0s' }} />
        <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tight animate-neo-slide-up" style={{ animationDelay: '0s' }}>
          Upload Data
        </h1>
        <p className="text-muted-foreground text-lg md:text-xl mt-4 max-w-xl animate-neo-slide-up" style={{ animationDelay: '0.1s' }}>
          Feed your documents to the RAG pipeline. Select files below to automatically index them for chat.
        </p>
      </div>

      <div className="space-y-8">
        
        {/* Error Banner */}
        {errorMessage && (
          <div className="border-3 border-foreground border-l-[8px] border-l-destructive bg-destructive/10 p-4 neo-shadow-sm flex items-start gap-3 animate-neo-slide-up">
            <AlertCircle className="w-6 h-6 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="font-black uppercase text-sm md:text-base">Upload Error</p>
              <p className="text-sm mt-1 font-medium">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* 3-Step Progress Indicator (Visible when uploading or done) */}
        {(isUploading || uploadResult) && (
          <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4 mb-8 animate-neo-slide-up" style={{ animationDelay: '0.1s' }}>
            {/* Step 1: Upload */}
            <div className={`w-full md:w-auto flex-1 border-3 border-foreground p-3 flex items-center gap-3 neo-shadow-sm ${isUploadComplete ? 'bg-emerald-200 dark:bg-emerald-400/30' : isUploading ? 'bg-primary/20' : 'bg-card'}`}>
              <div className={`p-2 border-2 border-foreground ${isUploadComplete ? 'bg-emerald-300 dark:bg-emerald-500/50' : 'bg-background'}`}>
                {isUploadComplete ? <CheckCircle2 className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
              </div>
              <div>
                <h4 className="font-black uppercase text-sm">1. Upload</h4>
                <p className="text-xs font-bold opacity-80">{isUploadComplete ? 'Done' : isUploading ? 'Uploading...' : 'Waiting'}</p>
              </div>
            </div>
            
            <ArrowRight className="w-6 h-6 text-foreground hidden md:block shrink-0" />

            {/* Step 2: Process */}
            <div className={`w-full md:w-auto flex-1 border-3 border-foreground p-3 flex items-center gap-3 neo-shadow-sm ${isProcessComplete ? 'bg-emerald-200 dark:bg-emerald-400/30' : isJobFailed ? 'bg-destructive/20' : isProcessingActive ? 'bg-sky-200 dark:bg-sky-400/30' : 'bg-card'}`}>
              <div className={`p-2 border-2 border-foreground ${isProcessComplete ? 'bg-emerald-300 dark:bg-emerald-500/50' : isJobFailed ? 'bg-destructive/30' : 'bg-background'}`}>
                {isProcessComplete ? <CheckCircle2 className="w-5 h-5" /> : isJobFailed ? <AlertCircle className="w-5 h-5 text-destructive" /> : <Database className="w-5 h-5" />}
              </div>
              <div>
                <h4 className="font-black uppercase text-sm">2. Processing</h4>
                <p className="text-xs font-bold opacity-80">{isProcessComplete ? 'Done' : isJobFailed ? 'Failed' : isProcessingActive ? 'Working...' : 'Waiting'}</p>
              </div>
            </div>

            <ArrowRight className="w-6 h-6 text-foreground hidden md:block shrink-0" />

            {/* Step 3: Complete */}
            <div className={`w-full md:w-auto flex-1 border-3 border-foreground p-3 flex items-center gap-3 neo-shadow-sm ${isProcessComplete ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>
              <div className={`p-2 border-2 border-foreground ${isProcessComplete ? 'bg-background text-foreground' : 'bg-background'}`}>
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black uppercase text-sm">3. Complete</h4>
                <p className="text-xs font-bold opacity-80">{isProcessComplete ? 'Ready to Chat' : 'Waiting'}</p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="animate-neo-slide-up" style={{ animationDelay: '0.2s' }}>
          
          {/* Dropzone */}
          <div className="space-y-2">
            <input
              id="uploadFiles"
              className="sr-only"
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS}
              onChange={onFileChange}
            />
            <label
              htmlFor="uploadFiles"
              className="group flex flex-col cursor-pointer items-center justify-center border-3 border-dashed border-foreground p-10 md:p-16 transition-all hover:bg-accent/10 hover:border-solid hover:neo-shadow-sm bg-card text-center relative overflow-hidden"
            >
              {/* Decorative shapes */}
              <div className="absolute top-6 -left-10 w-32 h-12 bg-amber-300 dark:bg-amber-500 rounded-full border-3 border-foreground -rotate-6 shadow-[4px_4px_0_0_var(--color-foreground)] opacity-40 group-hover:opacity-100 group-hover:translate-x-4 transition-all duration-300" />
              <div className="absolute -top-4 right-12 w-16 h-16 bg-sky-300 dark:bg-sky-500 border-3 border-foreground rotate-12 shadow-[4px_4px_0_0_var(--color-foreground)] opacity-40 group-hover:opacity-100 group-hover:rotate-[24deg] transition-all duration-300 delay-75" />
              <div className="absolute bottom-8 left-8 w-12 h-12 bg-accent border-3 border-dashed border-foreground rotate-45 opacity-40 group-hover:opacity-100 group-hover:scale-125 transition-all duration-300 delay-100" />
              <div className="absolute top-1/2 -translate-y-1/2 -right-8 w-16 h-32 bg-primary border-3 border-foreground rounded-l-full shadow-[4px_4px_0_0_var(--color-foreground)] opacity-40 group-hover:opacity-100 group-hover:-translate-x-4 transition-all duration-300 delay-150" />

              <div className="bg-primary/10 p-4 rounded-full border-3 border-primary mb-4 transition-transform group-hover:scale-110 relative z-10 bg-background/50 backdrop-blur-sm">
                <Upload className="w-10 h-10 text-primary" />
              </div>
              <p className="text-xl md:text-2xl font-black uppercase mb-3 relative z-10 px-2 py-1 bg-background/50 backdrop-blur-sm rounded">Click or drag files here</p>
              <p className="text-sm font-medium text-muted-foreground mb-6 relative z-10 bg-background/50 backdrop-blur-sm px-2 py-0.5 rounded">Support for multiple file formats</p>
              <div className="flex flex-wrap justify-center gap-2 relative z-10">
                {formatChips.map(ext => (
                  <span key={ext} className="border-2 border-foreground px-2 py-0.5 text-xs font-bold uppercase bg-background shadow-[2px_2px_0_0_var(--color-foreground)]">
                    {ext}
                  </span>
                ))}
              </div>
            </label>
          </div>

          {/* Selected Files Chips */}
          {selectedFiles.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-black uppercase text-muted-foreground mb-3 tracking-widest">Selected Files ({selectedFiles.length})</h3>
              <div className="flex flex-wrap gap-3">
                {selectedFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="border-3 border-foreground bg-secondary px-3 py-2 inline-flex items-center gap-3 neo-shadow-sm animate-neo-slide-up"
                    style={{ animationDelay: `${0.1 + index * 0.05}s` }}
                  >
                    <FileText className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-bold truncate max-w-[150px] md:max-w-[200px]" title={file.name}>
                      {file.name}
                    </span>
                    <span className="text-xs font-mono bg-background border-2 border-foreground px-1.5 py-0.5 shadow-[2px_2px_0_0_var(--color-foreground)] shrink-0">
                      {Math.ceil(file.size / 1024)} KB
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); removeFile(index); }}
                      className="hover:text-destructive hover:scale-125 transition-transform ml-1 p-1 bg-background border-2 border-foreground shadow-[2px_2px_0_0_var(--color-foreground)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              
              {/* Actions */}
              <div className="flex flex-wrap gap-3 mt-6">
                <Button type="submit" size="lg" className="text-base" disabled={isUploading || selectedFiles.length === 0}>
                  {isUploading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 mr-2" />
                      Upload {selectedFiles.length} {selectedFiles.length === 1 ? 'File' : 'Files'}
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="text-base"
                  disabled={isUploading}
                  onClick={resetSelection}
                >
                  Reset
                </Button>
              </div>
            </div>
          )}
        </form>

        {/* Results Blocks */}
        {uploadResult && (
          <div className="space-y-6 mt-12">
            
            {/* Status Block */}
            <div className="border-3 border-foreground bg-card p-5 md:p-6 neo-shadow-sm animate-neo-slide-up" style={{ animationDelay: '0.3s' }}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black uppercase">Job Details</h2>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="font-mono text-xs bg-muted px-2 py-1 border-2 border-foreground shadow-[2px_2px_0_0_var(--color-foreground)]">
                      <span className="font-bold mr-1 opacity-70">Session:</span> {uploadResult.uploadSessionId}
                    </span>
                    {uploadResult.jobId && (
                      <span className="font-mono text-xs bg-muted px-2 py-1 border-2 border-foreground shadow-[2px_2px_0_0_var(--color-foreground)]">
                        <span className="font-bold mr-1 opacity-70">Job:</span> {uploadResult.jobId}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  {getStatusBadge(jobStatus?.status || uploadResult.status || 'queued')}
                </div>
              </div>
            </div>

            {/* Accepted Files Block */}
            {uploadResult.uploadedFiles.length > 0 && (
              <div className="border-3 border-foreground border-l-[8px] border-l-emerald-500 bg-card p-5 md:p-6 neo-shadow-sm animate-neo-slide-up" style={{ animationDelay: '0.4s' }}>
                <h3 className="text-xl font-black uppercase mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  Accepted Files ({uploadResult.uploadedFiles.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {uploadResult.uploadedFiles.map(file => (
                    <div key={file.storedName} className="border-3 border-foreground p-4 bg-background flex flex-col gap-2">
                      <span className="font-bold truncate" title={file.originalName}>{file.originalName}</span>
                      <span className="text-xs font-mono text-muted-foreground truncate" title={file.storedPath}>
                        Path: {file.storedPath}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rejected Files Block */}
            {uploadResult.rejectedFiles.length > 0 && (
              <div className="border-3 border-foreground border-l-[8px] border-l-destructive bg-card p-5 md:p-6 neo-shadow-sm animate-neo-slide-up" style={{ animationDelay: '0.5s' }}>
                <h3 className="text-xl font-black uppercase mb-4 flex items-center gap-2">
                  <XCircle className="w-6 h-6 text-destructive" />
                  Rejected Files ({uploadResult.rejectedFiles.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {uploadResult.rejectedFiles.map((file, i) => (
                    <div key={`${file.originalName}-${i}`} className="border-3 border-foreground p-4 bg-background flex flex-col gap-2">
                      <span className="font-bold truncate" title={file.originalName}>{file.originalName}</span>
                      <span className="text-xs text-destructive font-bold break-words">Reason: {file.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Processing Details Block */}
            {jobStatus && jobStatus.documents.length > 0 && (
              <div className="border-3 border-foreground bg-card p-5 md:p-6 neo-shadow-sm animate-neo-slide-up" style={{ animationDelay: '0.6s' }}>
                <h3 className="text-xl font-black uppercase mb-4 flex items-center gap-2">
                  <Database className="w-6 h-6 text-primary" />
                  Document Processing Details
                </h3>
                <div className="space-y-3">
                  {jobStatus.documents.map(doc => (
                    <div key={doc.id} className="border-3 border-foreground p-3 md:p-4 bg-background flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-4 transition-colors hover:bg-accent/10">
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <span className="font-bold truncate" title={doc.originalName}>{doc.originalName}</span>
                        {doc.error && (
                          <span className="text-xs text-destructive font-bold break-words bg-destructive/10 px-2 py-1 border-2 border-destructive inline-block w-fit">
                            Error: {doc.error}
                          </span>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center">
                        {getDocStatusBadge(doc.structuredStatus)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
