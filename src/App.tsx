import { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';
import { UploadCloud, FileText, Image as ImageIcon, X, Loader2, Scale, ShieldAlert, Target, FileSearch, Database, BrainCircuit } from 'lucide-react';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Textarea } from './components/ui/textarea';
import { cn } from './lib/utils';
import { searchKnowledgeBase, LegalEntry } from './lib/legalKnowledgeBase';
import { LiveAudioAssistant } from './components/LiveAudioAssistant';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type UploadedFile = {
  id: string;
  file: File;
  preview: string;
  base64: string;
};

export default function App() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [result, setResult] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [kbResults, setKbResults] = useState<LegalEntry[]>([]);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'strategy' | 'extracted' | 'kb'>('strategy');
  const [fileFilter, setFileFilter] = useState<'all' | 'image' | 'document'>('all');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const newFiles = await Promise.all(
      acceptedFiles.map(async (file) => {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (error) => reject(error);
        });

        return {
          id: Math.random().toString(36).substring(7),
          file,
          preview: URL.createObjectURL(file),
          base64: base64.split(',')[1], // Remove data URL prefix
        };
      })
    );
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      'application/pdf': ['.pdf'],
    },
  });

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const fileToRemove = prev.find(f => f.id === id);
      if (fileToRemove) {
        URL.revokeObjectURL(fileToRemove.preview);
      }
      return prev.filter(f => f.id !== id);
    });
  };

  const filteredFiles = useMemo(() => {
    return files.filter(f => {
      if (fileFilter === 'all') return true;
      if (fileFilter === 'image') return f.file.type.startsWith('image/');
      if (fileFilter === 'document') return f.file.type === 'application/pdf';
      return true;
    });
  }, [files, fileFilter]);

  const analyzeCase = async () => {
    if (files.length === 0 && !description.trim()) {
      setError('Please provide a description or upload documents/images.');
      return;
    }

    setIsLoading(true);
    setError('');
    setResult('');
    setExtractedText('');
    setKbResults([]);
    setActiveTab('strategy');

    try {
      // --- STEP 1: OCR & Text Extraction ---
      let parsedText = '';
      if (files.length > 0) {
        setLoadingStatus('Extracting text from documents (OCR)...');
        const extractParts: any[] = files.map((f) => ({
          inlineData: {
            data: f.base64,
            mimeType: f.file.type,
          },
        }));
        
        extractParts.push({ 
          text: "Extract all readable text from the provided documents and images. If it's a form or structured document, maintain the logical flow. Return ONLY the extracted text, with no conversational filler." 
        });

        const extractResponse = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: { parts: extractParts },
        });

        parsedText = extractResponse.text || '';
        setExtractedText(parsedText);
      }

      // --- STEP 2: Query Legal Knowledge Base ---
      setLoadingStatus('Querying legal knowledge base...');
      const combinedContext = `${description}\n\n${parsedText}`;
      const matchedKbEntries = searchKnowledgeBase(combinedContext);
      setKbResults(matchedKbEntries);

      const kbContextString = matchedKbEntries.length > 0 
        ? `Relevant Internal Knowledge Base Entries:\n${matchedKbEntries.map(e => `- ${e.title} (${e.category}): ${e.description}`).join('\n')}`
        : 'No specific internal knowledge base entries found. Rely on general legal knowledge and search.';

      // --- STEP 3: AI Strategic Analysis ---
      setLoadingStatus('Generating strategic plan...');
      
      const analysisPrompt = `
        You are an expert legal strategist and consultant.
        
        User Case Description:
        ${description ? description : 'No description provided.'}
        
        Extracted Text from Uploaded Documents (OCR/Parsed):
        ${parsedText ? parsedText : 'No documents provided.'}
        
        ${kbContextString}
        
        Based on the primary inputs above, generate a professional, strategic plan for handling the case.
        Include the following sections:
        
        1. **Related Laws & Regulations**: Identify which specific laws, statutes, or regulations are likely related to this case. Use the provided Knowledge Base context and the Google Search tool to ensure accuracy.
        2. **Professional Handling Advice**: Advise on how to professionally handle the situation right now (e.g., what to say/not say, evidence preservation, communication protocols).
        3. **Strategic Resolution Plan**: Give a specific, step-by-step strategic plan to resolve the issue effectively.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: analysisPrompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      setResult(response.text || 'No analysis generated.');
    } catch (err: any) {
      console.error('Error analyzing case:', err);
      setError(err.message || 'An error occurred while analyzing the case.');
    } finally {
      setIsLoading(false);
      setLoadingStatus('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3 bg-blue-100 rounded-full mb-2">
            <Scale className="w-8 h-8 text-blue-700" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Max Claw Law</h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Upload your case documents, evidence images, and describe your situation. Our AI will analyze the details, identify relevant laws, and provide a strategic resolution plan.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Case Details</CardTitle>
                <CardDescription>Provide context and upload relevant files.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Situation Description
                  </label>
                  <Textarea
                    placeholder="Describe what happened, who is involved, and what your goals are..."
                    className="min-h-[150px] resize-y"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Evidence & Documents
                  </label>
                  <div
                    {...getRootProps()}
                    className={cn(
                      "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                      isDragActive ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-slate-400 bg-slate-50"
                    )}
                  >
                    <input {...getInputProps()} />
                    <UploadCloud className="mx-auto h-10 w-10 text-slate-400 mb-4" />
                    <p className="text-sm text-slate-600 font-medium">
                      Drag & drop files here, or click to select
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Supports PDF documents and Images (JPG, PNG)
                    </p>
                  </div>

                  {files.length > 0 && (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-slate-700">Attached Files ({files.length})</h4>
                        <div className="flex bg-slate-100 p-1 rounded-md">
                          <button
                            onClick={() => setFileFilter('all')}
                            className={cn("text-xs px-2 py-1 rounded-sm transition-colors", fileFilter === 'all' ? "bg-white shadow-sm font-medium text-slate-900" : "text-slate-500 hover:text-slate-700")}
                          >
                            All
                          </button>
                          <button
                            onClick={() => setFileFilter('document')}
                            className={cn("text-xs px-2 py-1 rounded-sm transition-colors", fileFilter === 'document' ? "bg-white shadow-sm font-medium text-slate-900" : "text-slate-500 hover:text-slate-700")}
                          >
                            Docs
                          </button>
                          <button
                            onClick={() => setFileFilter('image')}
                            className={cn("text-xs px-2 py-1 rounded-sm transition-colors", fileFilter === 'image' ? "bg-white shadow-sm font-medium text-slate-900" : "text-slate-500 hover:text-slate-700")}
                          >
                            Images
                          </button>
                        </div>
                      </div>
                      
                      {filteredFiles.length === 0 ? (
                        <p className="text-sm text-slate-500 italic text-center py-2">No files match the selected filter.</p>
                      ) : (
                        <ul className="space-y-2">
                          {filteredFiles.map((file) => (
                            <li key={file.id} className="flex items-center justify-between p-3 bg-white border rounded-md shadow-sm">
                              <div className="flex items-center space-x-3 overflow-hidden">
                                {file.file.type.startsWith('image/') ? (
                                  <ImageIcon className="h-5 w-5 text-blue-500 flex-shrink-0" />
                                ) : (
                                  <FileText className="h-5 w-5 text-orange-500 flex-shrink-0" />
                                )}
                                <span className="text-sm truncate font-medium text-slate-700">
                                  {file.file.name}
                                </span>
                              </div>
                              <button
                                onClick={() => removeFile(file.id)}
                                className="text-slate-400 hover:text-red-500 transition-colors p-1"
                                title="Remove file"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start space-x-2 text-red-600">
                    <ShieldAlert className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <p className="text-sm">{error}</p>
                  </div>
                )}

                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-base"
                  onClick={analyzeCase}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {loadingStatus || 'Analyzing Case...'}
                    </>
                  ) : (
                    <>
                      <Target className="mr-2 h-5 w-5" />
                      Analyze Case & Get Strategy
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <LiveAudioAssistant 
              contextText={`Case Description: ${description}\n\nExtracted Text: ${extractedText}\n\nAnalysis Result: ${result}`.slice(0, 15000)} 
            />
          </div>

          <div className="lg:col-span-7">
            <Card className="h-full min-h-[600px] flex flex-col">
              <CardHeader className="border-b bg-slate-50/50 pb-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <CardTitle>Analysis Results</CardTitle>
                    <CardDescription>AI-generated insights, extracted text, and KB matches.</CardDescription>
                  </div>
                </div>
                
                {/* Tabs */}
                <div className="flex space-x-4 border-b border-slate-200">
                  <button
                    className={cn(
                      "pb-3 text-sm font-medium transition-colors relative",
                      activeTab === 'strategy' ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
                    )}
                    onClick={() => setActiveTab('strategy')}
                  >
                    <div className="flex items-center space-x-2">
                      <BrainCircuit className="w-4 h-4" />
                      <span>Strategic Plan</span>
                    </div>
                    {activeTab === 'strategy' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />
                    )}
                  </button>
                  <button
                    className={cn(
                      "pb-3 text-sm font-medium transition-colors relative",
                      activeTab === 'extracted' ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
                    )}
                    onClick={() => setActiveTab('extracted')}
                  >
                    <div className="flex items-center space-x-2">
                      <FileSearch className="w-4 h-4" />
                      <span>Extracted Text (OCR)</span>
                    </div>
                    {activeTab === 'extracted' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />
                    )}
                  </button>
                  <button
                    className={cn(
                      "pb-3 text-sm font-medium transition-colors relative",
                      activeTab === 'kb' ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
                    )}
                    onClick={() => setActiveTab('kb')}
                  >
                    <div className="flex items-center space-x-2">
                      <Database className="w-4 h-4" />
                      <span>Knowledge Base</span>
                    </div>
                    {activeTab === 'kb' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />
                    )}
                  </button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-6 overflow-y-auto">
                {isLoading ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4 py-20">
                    <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
                    <p className="text-lg font-medium text-slate-600">{loadingStatus}</p>
                    <p className="text-sm text-slate-500">This multi-step process may take a minute.</p>
                  </div>
                ) : !result && !extractedText ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4 py-20 text-center">
                    <div className="p-4 bg-slate-100 rounded-full">
                      <ShieldAlert className="h-10 w-10 text-slate-300" />
                    </div>
                    <div>
                      <p className="text-lg font-medium text-slate-600">No analysis yet</p>
                      <p className="text-sm text-slate-500 max-w-sm mt-1">Upload your documents and provide a description to generate a strategic plan.</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-full">
                    {activeTab === 'strategy' && (
                      <div className="prose prose-slate max-w-none prose-headings:text-slate-800 prose-a:text-blue-600 hover:prose-a:text-blue-500">
                        <Markdown>{result}</Markdown>
                      </div>
                    )}
                    
                    {activeTab === 'extracted' && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-slate-800">Raw Extracted Text</h3>
                        {extractedText ? (
                          <div className="bg-slate-100 p-4 rounded-md text-sm font-mono text-slate-700 whitespace-pre-wrap">
                            {extractedText}
                          </div>
                        ) : (
                          <p className="text-slate-500 italic">No text was extracted from the provided documents.</p>
                        )}
                      </div>
                    )}

                    {activeTab === 'kb' && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-slate-800">Knowledge Base Matches</h3>
                        <p className="text-sm text-slate-500 mb-4">
                          These internal knowledge base entries were matched against your case description and extracted text.
                        </p>
                        {kbResults.length > 0 ? (
                          <div className="space-y-4">
                            {kbResults.map((entry) => (
                              <div key={entry.id} className="p-4 border border-slate-200 rounded-lg bg-white shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="font-semibold text-slate-800">{entry.title}</h4>
                                  <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                                    {entry.category}
                                  </span>
                                </div>
                                <p className="text-sm text-slate-600 mb-3">{entry.description}</p>
                                <div className="flex flex-wrap gap-1">
                                  {entry.keywords.map(kw => (
                                    <span key={kw} className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-slate-500 italic">No specific matches found in the internal knowledge base.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
