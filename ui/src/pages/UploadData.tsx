import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Upload, FileText, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { api, type UploadFilesResponse } from '@/lib/serverComm';

const ACCEPTED_EXTENSIONS = '.csv,.pdf,.md,.markdown,.xls,.xlsx';

export function UploadData() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadFilesResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const acceptedExtensionsList = useMemo(
    () => ACCEPTED_EXTENSIONS.split(',').map((entry) => entry.trim()),
    []
  );

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files || []);
    setSelectedFiles(nextFiles);
    setUploadResult(null);
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
    setErrorMessage('');
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (selectedFiles.length === 0) {
      setErrorMessage('Select at least one file before uploading.');
      return;
    }

    try {
      setIsUploading(true);
      setUploadResult(null);
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

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Upload Data</h1>
          <p className="text-muted-foreground">
            Upload CSV, PDF, Markdown, and Excel files to temporary backend storage.
          </p>
        </div>

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Data Files
            </CardTitle>
            <CardDescription>
              Supported extensions: {acceptedExtensionsList.join(', ')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="uploadFiles" className="sr-only">
                  Select files
                </Label>
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
                  className="group flex cursor-pointer items-center justify-between rounded-md border border-dashed p-4 transition-colors hover:border-primary/60 hover:bg-accent/40"
                >
                  <div className="flex items-center gap-3">
                    <Upload className="h-5 w-5 text-muted-foreground transition-transform duration-200 group-hover:scale-110 group-hover:-translate-y-0.5" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Click to choose files</p>
                      <p className="text-xs text-muted-foreground">
                        CSV, PDF, Markdown, and Excel formats are supported.
                      </p>
                    </div>
                  </div>
                </label>
              </div>

              {selectedFiles.length > 0 ? (
                <div className="space-y-2">
                  {selectedFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between rounded-md border p-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 shrink-0" />
                        <span className="truncate text-sm">{file.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          ({Math.ceil(file.size / 1024)} KB)
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(index)}
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isUploading || selectedFiles.length === 0}>
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    'Upload Selected Files'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isUploading}
                  onClick={resetSelection}
                >
                  Reset
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {errorMessage ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {uploadResult ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Upload Complete
              </CardTitle>
              <CardDescription>
                Session ID: <span className="font-mono">{uploadResult.uploadSessionId}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="font-medium">Accepted files ({uploadResult.uploadedFiles.length})</p>
                <div className="mt-2 space-y-2">
                  {uploadResult.uploadedFiles.map((file) => (
                    <div key={file.storedName} className="rounded-md border p-2">
                      <p>{file.originalName}</p>
                      <p className="text-muted-foreground">Stored at: {file.storedPath}</p>
                    </div>
                  ))}
                </div>
              </div>

              {uploadResult.rejectedFiles.length > 0 ? (
                <div>
                  <p className="font-medium">Rejected files ({uploadResult.rejectedFiles.length})</p>
                  <div className="mt-2 space-y-2">
                    {uploadResult.rejectedFiles.map((file, index) => (
                      <div key={`${file.originalName}-${index}`} className="rounded-md border p-2">
                        <p>{file.originalName}</p>
                        <p className="text-muted-foreground">Reason: {file.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
