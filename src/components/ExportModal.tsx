import React, { useState } from 'react';
import { Check, Copy, Download, FileArchive, Github, Terminal, X, AlertCircle } from 'lucide-react';
import { ZIP_BASE64 } from '../zipData';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedGit, setCopiedGit] = useState(false);

  if (!isOpen) return null;

  const handleDownloadDirect = () => {
    try {
      const binaryString = atob(ZIP_BASE64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'darius-os-lab.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (err) {
      console.error('Download error:', err);
      // Fallback to data URI
      window.location.href = `data:application/zip;base64,${ZIP_BASE64}`;
    }
  };

  const powershellCommand = `$b64 = "${ZIP_BASE64}"; [System.IO.File]::WriteAllBytes("$HOME\\Downloads\\darius-os-lab.zip", [System.Convert]::FromBase64String($b64)); Expand-Archive -Path "$HOME\\Downloads\\darius-os-lab.zip" -DestinationPath "$HOME\\darius-os-lab" -Force; Write-Host "Extraído com sucesso em $HOME\\darius-os-lab" -ForegroundColor Green`;

  const gitPushCommand = `cd $HOME\\darius-os-lab
git init
git branch -M main
git remote add origin https://github.com/prdariomarques-ship-it/dario-os-lab.git
git add -A
git commit -m "feat: DARIUS OSS AI Layer complete suite"
git push -u origin main --force`;

  const copyToClipboard = (text: string, setFn: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setFn(true);
    setTimeout(() => setFn(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-zinc-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500 text-zinc-950 font-bold">
              <FileArchive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
                Exportar Projeto DARIUS OSS (ZIP 100% Válido)
              </h2>
              <p className="text-xs text-zinc-500">
                Arquivo gerado diretamente na memória (sem passar por proxy ou tela de login)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg hover:bg-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Why the previous download had an issue */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Por que deu "Pasta Compactada Inválida" antes?</span> O link externo anterior foi interceptado pela proteção de login do Google Cloud Run, que baixou uma página HTML disfarçada de .zip. O botão abaixo gera os bytes binários reais do ZIP direto no seu navegador!
            </div>
          </div>

          {/* Method 1: Instant In-Memory Download */}
          <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50/70">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-zinc-900 text-white text-[11px] flex items-center justify-center font-mono">1</span>
                  Baixar Arquivo .ZIP Real (Recomendado)
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Gera os 102 KB de arquivos binários descompactáveis nativamente no Windows Explorer.
                </p>
              </div>
              <button
                id="btn-download-direct-memory"
                onClick={handleDownloadDirect}
                className="flex items-center gap-2 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold rounded-lg shadow-sm transition-all border border-amber-500 cursor-pointer"
              >
                {downloadSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-800" />
                    <span>Baixado!</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Baixar darius-os-lab.zip</span>
                  </>
                )}
              </button>
            </div>
            {downloadSuccess && (
              <p className="text-xs text-emerald-700 font-medium mt-2">
                ✓ Arquivo baixado para a sua pasta Downloads! Agora o Windows abrirá normalmente sem erro.
              </p>
            )}
          </div>

          {/* Method 2: PowerShell Instant Extraction */}
          <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50/70">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-zinc-900 text-white text-[11px] flex items-center justify-center font-mono">2</span>
                  Ou Extrair Direto no PowerShell do Windows
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Copie e cole este comando no seu PowerShell para criar a pasta já descompactada em seu computador.
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(powershellCommand, setCopiedScript)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedScript ? 'Copiado!' : 'Copiar Comando'}</span>
              </button>
            </div>
            <div className="bg-zinc-950 rounded-lg p-2.5 text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-20 select-all border border-zinc-800">
              {powershellCommand.slice(0, 160)}...
            </div>
          </div>

          {/* Method 3: Push to GitHub */}
          <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50/70">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                  <Github className="w-4 h-4 text-zinc-900" />
                  Comandos para subir no seu GitHub
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Após descompactar, rode na pasta do projeto para enviar ao repositório:
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(gitPushCommand, setCopiedGit)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold rounded-lg border border-zinc-300 transition-colors cursor-pointer"
              >
                {copiedGit ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedGit ? 'Copiado!' : 'Copiar Git'}</span>
              </button>
            </div>
            <pre className="bg-zinc-900 rounded-lg p-2.5 text-[11px] font-mono text-zinc-200 overflow-x-auto border border-zinc-800">
              {gitPushCommand}
            </pre>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-zinc-200 bg-zinc-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-zinc-200 text-zinc-700 hover:bg-zinc-300 transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
