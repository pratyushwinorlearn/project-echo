
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTED_CHARACTERS = 1500000;

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.mdx',
  '.markdown',
  '.rst',
  '.adoc',
  '.txt',
  '.text',
  '.json',
  '.jsonc',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.py',
  '.java',
  '.cpp',
  '.cc',
  '.c',
  '.h',
  '.hpp',
  '.cs',
  '.go',
  '.rs',
  '.php',
  '.rb',
  '.sql',
  '.css',
  '.scss',
  '.html',
  '.htm',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.properties',
  '.gradle',
  '.sh',
  '.bash',
  '.ps1',
  '.bat',
  '.config',
  '.log',
  '.makefile',
  '.cmakelists.txt',
  '.procfile',
  '.dockerfile',
  '.dockerignore',
  '.gitignore',
  '.gitmodules',
  '.editorconfig',
  '.env.example'
]);

const SPECIAL_FILENAMES = new Map([
  ['dockerfile', '.dockerfile'],
  ['makefile', '.makefile'],
  ['cmakelists.txt', '.cmakelists.txt'],
  ['procfile', '.procfile'],
  ['.dockerignore', '.dockerignore'],
  ['.gitignore', '.gitignore'],
  ['.gitmodules', '.gitmodules'],
  ['.editorconfig', '.editorconfig'],
  ['.env.example', '.env.example']
]);

const SUPPORTED_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  '.pdf',
  '.docx'
]);

function getExtension(filePath) {
  const fileName = path.basename(filePath).toLowerCase();

  if (SPECIAL_FILENAMES.has(fileName)) {
    return SPECIAL_FILENAMES.get(fileName);
  }

  return path.extname(fileName).toLowerCase();
}

function isSupportedFile(filePath) {
  return SUPPORTED_EXTENSIONS.has(
    getExtension(filePath)
  );
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (match, number) => {
      const codePoint = Number(number);

      if (
        !Number.isInteger(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10FFFF
      ) {
        return match;
      }

      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
      const codePoint = parseInt(hex, 16);

      if (
        !Number.isInteger(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10FFFF
      ) {
        return match;
      }

      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    });
}

function htmlToText(value) {
  const cleaned = String(value || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(
      /<\/(p|div|h[1-6]|li|tr|section|article|header|footer|pre|blockquote)>/gi,
      '\n\n'
    )
    .replace(
      /<(p|div|h[1-6]|li|tr|section|article|header|footer|pre|blockquote)\b[^>]*>/gi,
      '\n'
    )
    .replace(/<[^>]+>/g, ' ');

  return decodeHtmlEntities(cleaned);
}

async function extractPdf(buffer) {
  let pdfModule;

  try {
    pdfModule = require('pdf-parse');
  } catch {
    throw new Error(
      'PDF support is not installed. Run: npm install pdf-parse'
    );
  }

  // pdf-parse v2 API.
  if (typeof pdfModule.PDFParse === 'function') {
    const parser = new pdfModule.PDFParse({
      data: buffer
    });

    try {
      const result = await parser.getText();

      return {
        text: result?.text || '',
        pageCount:
          result?.total ||
          result?.pages?.length ||
          null
      };
    } finally {
      await parser.destroy();
    }
  }

  // Compatibility with pdf-parse v1.
  if (typeof pdfModule === 'function') {
    const result = await pdfModule(buffer);

    return {
      text: result?.text || '',
      pageCount: result?.numpages || null
    };
  }

  throw new Error(
    'The installed pdf-parse package has an unsupported API.'
  );
}

async function extractDocx(buffer) {
  let mammoth;

  try {
    mammoth = require('mammoth');
  } catch {
    throw new Error(
      'Word document support is not installed. Run: npm install mammoth'
    );
  }

  const result = await mammoth.extractRawText({
    buffer
  });

  const warnings = Array.isArray(result.messages)
    ? result.messages
        .filter((message) => message.type === 'warning')
        .map((message) => message.message)
    : [];

  return {
    text: result.value || '',
    pageCount: null,
    warnings
  };
}

async function extractDocument(filePath) {
  if (
    typeof filePath !== 'string' ||
    !path.isAbsolute(filePath)
  ) {
    throw new Error('Invalid file path.');
  }

  const extension = getExtension(filePath);

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error(
      `Unsupported file format: ${extension || 'unknown'}`
    );
  }

  const stat = await fs.stat(filePath);

  if (!stat.isFile()) {
    throw new Error('The selected path is not a file.');
  }

  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(
      'This file is larger than the 10 MB import limit.'
    );
  }

  if (stat.size === 0) {
    throw new Error('The selected file is empty.');
  }

  const buffer = await fs.readFile(filePath);

  let extracted = {
    text: '',
    pageCount: null,
    warnings: []
  };

  if (extension === '.pdf') {
    extracted = await extractPdf(buffer);
  } else if (extension === '.docx') {
    extracted = await extractDocx(buffer);
  } else {
    if (buffer.includes(0)) {
      throw new Error(
        'This appears to be a binary file rather than readable text.'
      );
    }

    let raw;

    try {
      raw = new TextDecoder('utf-8', {
        fatal: true
      }).decode(buffer);
    } catch {
      throw new Error(
        'This file is not valid UTF-8 text and cannot be imported safely.'
      );
    }

    extracted.text =
      extension === '.html' || extension === '.htm'
        ? htmlToText(raw)
        : raw;
  }

  const text = normalizeText(extracted.text);

  if (!text) {
    if (extension === '.pdf') {
      throw new Error(
        'No selectable text was found in this PDF. Scanned-PDF OCR is not included yet.'
      );
    }

    throw new Error(
      'No readable text could be extracted from this file.'
    );
  }

  if (text.length > MAX_EXTRACTED_CHARACTERS) {
    throw new Error(
      'The extracted document exceeds the 1.5 million character limit.'
    );
  }

  return {
    text,
    extension,
    pageCount: extracted.pageCount || null,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    characterCount: text.length,
    warnings: extracted.warnings || []
  };
}

function getSupportedExtensions() {
  return Array.from(SUPPORTED_EXTENSIONS)
    .map((extension) => extension.replace(/^\./, ''))
    .sort();
}

module.exports = {
  extractDocument,
  isSupportedFile,
  getSupportedExtensions,
  getExtension,
  MAX_FILE_BYTES,
  MAX_EXTRACTED_CHARACTERS
};
