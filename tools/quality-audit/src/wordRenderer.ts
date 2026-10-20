import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { DocxRenderResult, QualityAuditOptions } from './types.js';

const execFileAsync = promisify(execFile);

export class WordRenderer {
  private scriptPath: string;

  constructor(customScriptPath?: string) {
    this.scriptPath = customScriptPath || path.resolve(process.cwd(), 'tools/quality-audit/scripts/render_docx_to_png.ps1');
  }

  /**
   * Checks whether Word COM automation is available on the local Windows host.
   */
  public async isWordComAvailable(): Promise<boolean> {
    try {
      const psCommand = `
        try {
          $w = New-Object -ComObject Word.Application;
          $w.Visible = $false;
          $w.Quit();
          [System.Runtime.InteropServices.Marshal]::ReleaseComObject($w) | Out-Null;
          Write-Output "AVAILABLE";
        } catch {
          Write-Output "UNAVAILABLE";
        }
      `;
      const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', psCommand], { timeout: 10000 });
      return stdout.trim().includes('AVAILABLE');
    } catch {
      return false;
    }
  }

  /**
   * Renders DOCX file to PDF and individual PNG page images using Word COM and WinRT.
   */
  public async renderDocxToImages(
    docxPath: string,
    outputDir: string,
    options?: QualityAuditOptions
  ): Promise<DocxRenderResult> {
    const fullDocxPath = path.resolve(docxPath);
    if (!fs.existsSync(fullDocxPath)) {
      return {
        success: false,
        docPath: fullDocxPath,
        pageCount: 0,
        pngPaths: [],
        error: `DOCX file does not exist: ${fullDocxPath}`,
      };
    }

    const isAvail = await this.isWordComAvailable();
    if (!isAvail) {
      return {
        success: false,
        skipped: true,
        skipReason: 'Word COM is not available on this host environment.',
        docPath: fullDocxPath,
        pageCount: 0,
        pngPaths: [],
      };
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const prefix = path.basename(docxPath, path.extname(docxPath));
    const width = options?.targetWidth ?? 1400;
    const timeoutSec = options?.timeoutSec ?? 60;

    const args = [
      '-ExecutionPolicy', 'Bypass',
      '-NoProfile',
      '-File', this.scriptPath,
      '-DocxPath', fullDocxPath,
      '-OutputDir', path.resolve(outputDir),
      '-Prefix', prefix,
      '-Width', width.toString(),
      '-TimeoutSec', timeoutSec.toString(),
    ];

    try {
      const { stdout, stderr } = await execFileAsync('powershell', args, {
        timeout: (timeoutSec + 10) * 1000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const trimmed = stdout.trim();
      if (!trimmed) {
        return {
          success: false,
          docPath: fullDocxPath,
          pageCount: 0,
          pngPaths: [],
          error: `Empty output from PowerShell render script. Stderr: ${stderr}`,
        };
      }

      // Find the JSON line in output
      const jsonLine = trimmed.split('\n').map(l => l.trim()).filter(l => l.startsWith('{')).pop();
      if (!jsonLine) {
        return {
          success: false,
          docPath: fullDocxPath,
          pageCount: 0,
          pngPaths: [],
          error: `Failed to parse JSON result from PowerShell output: ${trimmed}`,
        };
      }

      const parsed = JSON.parse(jsonLine);
      return {
        success: Boolean(parsed.success),
        docPath: parsed.docPath || fullDocxPath,
        pageCount: Number(parsed.pageCount || 0),
        pngPaths: Array.isArray(parsed.pngPaths) ? parsed.pngPaths : [],
        pdfPath: parsed.pdfPath,
        stats: parsed.stats,
        error: parsed.error,
        skipped: Boolean(parsed.skipped),
        skipReason: parsed.skipReason,
      };
    } catch (err: any) {
      if (err.killed || (err.message && err.message.includes('timed out'))) {
        return {
          success: false,
          docPath: fullDocxPath,
          pageCount: 0,
          pngPaths: [],
          error: `Word COM rendering timed out after ${timeoutSec} seconds.`,
        };
      }
      return {
        success: false,
        docPath: fullDocxPath,
        pageCount: 0,
        pngPaths: [],
        error: `Word rendering execution failed: ${err.message}`,
      };
    }
  }
}
