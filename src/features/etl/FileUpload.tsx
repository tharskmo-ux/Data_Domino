import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File as LucideFile, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import * as XLSX from 'xlsx';

export interface FileMetadata {
    name: string;
    type: string;
    format: string;
    size: string;
    uploadedBy: string;
    rows: number;
    cols: number;
    quality: number;
}

interface FileUploadProps {
    onUploadComplete: (data: any[], metadata: FileMetadata) => void;
    maxSizeMB?: number;
    disabled?: boolean;
}

interface UploadingFile {
    id: string;
    file: File;
    progress: number;
    status: 'uploading' | 'completed' | 'error';
    error?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({ onUploadComplete, maxSizeMB = 100, disabled = false }) => {
    const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (disabled) return;
        const newFiles = acceptedFiles.map(file => ({
            id: Math.random().toString(36).substr(2, 9),
            file,
            progress: 0,
            status: 'uploading' as const
        }));

        setUploadingFiles(prev => [...prev, ...newFiles]);

        // Process each file
        newFiles.forEach(fileObj => {
            processFile(fileObj);
        });
    }, [disabled]);

    const processFile = (fileObj: UploadingFile) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

                // Calculate Metadata
                const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];

                // Calculate Data Quality (ratio of non-null values)
                let totalCells = jsonData.length * headers.length;
                let nonNullCells = 0;
                jsonData.forEach(row => {
                    headers.forEach(header => {
                        if (row[header] !== null && row[header] !== undefined && row[header] !== '') {
                            nonNullCells++;
                        }
                    });
                });
                const quality = totalCells > 0 ? Math.round((nonNullCells / totalCells) * 100) : 0;

                const metadata: FileMetadata = {
                    name: fileObj.file.name,
                    type: jsonData.length > 0 && headers.some(h => h.toLowerCase().includes('sale')) ? 'Sales Data' : 'Spend Data',
                    format: fileObj.file.name.split('.').pop()?.toUpperCase() || 'Unknown',
                    size: (fileObj.file.size / 1024 / 1024).toFixed(2) + ' MB',
                    uploadedBy: 'Demo Admin', // Mocked for now
                    rows: jsonData.length,
                    cols: headers.length,
                    quality
                };

                setUploadingFiles(prev => {
                    const updated: UploadingFile[] = prev.map(f =>
                        f.id === fileObj.id ? { ...f, progress: 100, status: 'completed' as const } : f
                    );

                    if (updated.every(f => f.status === 'completed')) {
                        onUploadComplete(jsonData, metadata);
                    }
                    return updated;
                });
            } catch (err) {
                console.error('File parsing error:', err);
                setUploadingFiles(prev => prev.map(f =>
                    f.id === fileObj.id ? { ...f, status: 'error', error: 'Failed to parse file' } : f
                ));
            }
        };

        reader.onprogress = (e) => {
            if (e.lengthComputable) {
                const progress = (e.loaded / e.total) * 100;
                setUploadingFiles(prev => prev.map(f =>
                    f.id === fileObj.id ? { ...f, progress } : f
                ));
            }
        };

        reader.readAsArrayBuffer(fileObj.file);
    };

    const removeFile = (id: string) => {
        setUploadingFiles(prev => prev.filter(f => f.id !== id));
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        maxSize: maxSizeMB * 1024 * 1024,
        disabled,
        accept: {
            'text/csv': ['.csv'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/vnd.ms-excel': ['.xls']
        }
    });

    return (
        <div className="space-y-6">
            <div
                {...getRootProps()}
                className={cn(
                    "relative border-2 border-dashed rounded-3xl p-12 transition-all group flex flex-col items-center justify-center text-center",
                    disabled
                        ? "border-zinc-900 bg-zinc-900/20 cursor-not-allowed"
                        : isDragActive
                            ? "border-primary bg-primary/5 scale-[0.99] cursor-pointer"
                            : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900 cursor-pointer"
                )}
            >
                <input {...getInputProps()} />

                <div className={cn(
                    "w-20 h-20 rounded-2xl flex items-center justify-center mb-6 transition-all",
                    disabled
                        ? "bg-zinc-900 text-zinc-700"
                        : "bg-zinc-800 text-zinc-500 group-hover:text-primary group-hover:bg-primary/10"
                )}>
                    <Upload className="h-10 w-10" />
                </div>

                <h3 className={cn("text-2xl font-bold mb-2", disabled ? "text-zinc-600" : "text-white")}>
                    {disabled ? 'Upload Limit Reached' : 'Click or drag data here'}
                </h3>
                <p className="text-zinc-500 max-w-sm">
                    {disabled
                        ? 'Trial users can only upload one file per project.'
                        : `Support CSV and Excel files up to ${maxSizeMB}MB.`}
                </p>

                {isDragActive && (
                    <div className="absolute inset-0 bg-primary/10 backdrop-blur-[2px] rounded-3xl flex items-center justify-center border-2 border-primary">
                        <p className="text-primary font-bold text-xl">Drop to start ingestion</p>
                    </div>
                )}
            </div>

            {/* File List */}
            <AnimatePresence>
                {uploadingFiles.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-3"
                    >
                        <div className="flex justify-between items-center mb-2 px-1">
                            <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Ingestion Queue</h4>
                            <span className="text-xs text-zinc-600">{uploadingFiles.length} files</span>
                        </div>

                        {uploadingFiles.map((fileObj) => (
                            <motion.div
                                key={fileObj.id}
                                layout
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex items-center gap-4"
                            >
                                <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-400">
                                    <LucideFile className="h-5 w-5" />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-sm font-bold text-zinc-200 truncate pr-4">{fileObj.file.name}</span>
                                        <button
                                            onClick={() => removeFile(fileObj.id)}
                                            className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                            <motion.div
                                                className="h-full bg-primary"
                                                animate={{ width: `${fileObj.progress}%` }}
                                            />
                                        </div>
                                        <span className="text-[10px] font-mono text-zinc-500 w-8 text-right">
                                            {Math.round(fileObj.progress)}%
                                        </span>
                                    </div>
                                </div>

                                <div className="flex-shrink-0">
                                    {fileObj.status === 'completed' ? (
                                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                    ) : fileObj.status === 'error' ? (
                                        <AlertCircle className="h-5 w-5 text-destructive" />
                                    ) : (
                                        <Loader2 className="h-5 w-5 text-primary animate-spin" />
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default FileUpload;
