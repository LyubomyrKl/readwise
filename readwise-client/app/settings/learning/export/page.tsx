'use client';

import { useState, useRef, useCallback } from 'react';
import { Download, Upload, FileJson, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { LearningExportResponse, ImportResultResponse } from '@/lib/types';

export default function ExportImportPage() {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportData, setExportData] = useState<LearningExportResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportJson = useCallback(async () => {
    setIsExporting(true);
    setError(null);
    try {
      const response = await fetch('/api/learning/export');
      if (!response.ok) {
        throw new Error('Failed to export data');
      }
      const data: LearningExportResponse = await response.json();
      setExportData(data);

      // Download as file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `learning-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleExportCsv = useCallback(async () => {
    setIsExporting(true);
    setError(null);
    try {
      const response = await fetch('/api/learning/export/csv');
      if (!response.ok) {
        throw new Error('Failed to export CSV');
      }
      const csvData = await response.text();

      // Download as file
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `learning-notes-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV export failed');
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setError(null);
    setImportResult(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const response = await fetch('/api/learning/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          skipExisting: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Import failed');
      }

      const result: ImportResultResponse = await response.json();
      setImportResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Export & Import</h2>
        <p className="text-muted-foreground">
          Backup your learning data or transfer it to another device.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {importResult && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>Import Complete</AlertTitle>
          <AlertDescription>
            Imported {importResult.imported} notes, skipped {importResult.skipped} existing notes.
            {importResult.errors > 0 && ` ${importResult.errors} errors occurred.`}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export Data
            </CardTitle>
            <CardDescription>
              Download your learning notes and progress.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3">
              <Button
                onClick={handleExportJson}
                disabled={isExporting}
                className="justify-start gap-2"
              >
                <FileJson className="h-4 w-4" />
                {isExporting ? 'Exporting...' : 'Export as JSON'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Full backup including cards, progress, and settings. Can be imported back.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                onClick={handleExportCsv}
                disabled={isExporting}
                variant="outline"
                className="justify-start gap-2"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {isExporting ? 'Exporting...' : 'Export as CSV'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Simple format for spreadsheets. Notes only, no card progress.
              </p>
            </div>

            {exportData && (
              <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium mb-1">Last Export Summary</p>
                <ul className="text-muted-foreground space-y-1">
                  <li>Total Notes: {exportData.statistics.totalNotes}</li>
                  <li>Mature Vocabulary: {exportData.statistics.matureVocabulary}</li>
                  <li>Retention Rate: {(exportData.statistics.retentionRate * 100).toFixed(1)}%</li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import Data
            </CardTitle>
            <CardDescription>
              Restore from a previous backup or migrate from another device.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              onClick={handleImportClick}
              disabled={isImporting}
              className="justify-start gap-2"
            >
              <FileJson className="h-4 w-4" />
              {isImporting ? 'Importing...' : 'Import from JSON'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Select a JSON file exported from this app. Existing notes with the same content will be skipped.
            </p>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Note</AlertTitle>
              <AlertDescription className="text-sm">
                Import will add new notes and preserve your existing data. Duplicate notes are automatically skipped.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
