import { useState, useRef, useEffect, useMemo } from 'react';

const JS_KEYWORDS = new Set([
  'async','await','break','case','catch','class','const','continue','default',
  'delete','do','else','export','extends','finally','for','from','function',
  'if','import','in','instanceof','let','new','of','return','static','super',
  'switch','this','throw','try','typeof','var','void','while','with','yield',
]);

const JS_BUILTINS = new Set([
  'console','Math','JSON','Object','Array','Promise','Map','Set','Date',
  'Error','RegExp','Number','String','Boolean','Symbol','null','undefined',
  'true','false','NaN','Infinity','parseInt','parseFloat','setTimeout',
  'setInterval','clearTimeout','clearInterval','fetch','require','module',
  'exports','process','Buffer','window','document','navigator',
]);

function tokenize(code) {
  const tokens = [];
  let i = 0;

  while (i < code.length) {
    // Single-line comment
    if (code[i] === '/' && code[i + 1] === '/') {
      let end = code.indexOf('\n', i);
      if (end === -1) end = code.length;
      tokens.push({ type: 'comment', value: code.slice(i, end) });
      i = end;
      continue;
    }

    // Multi-line comment
    if (code[i] === '/' && code[i + 1] === '*') {
      let end = code.indexOf('*/', i + 2);
      if (end === -1) end = code.length; else end += 2;
      tokens.push({ type: 'comment', value: code.slice(i, end) });
      i = end;
      continue;
    }

    // Strings
    if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
      const quote = code[i];
      let j = i + 1;
      while (j < code.length && code[j] !== quote) {
        if (code[j] === '\\') j++;
        j++;
      }
      j++;
      tokens.push({ type: 'string', value: code.slice(i, j) });
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(code[i]) && (i === 0 || !/[a-zA-Z_$]/.test(code[i - 1]))) {
      let j = i;
      while (j < code.length && /[0-9.xXa-fA-FeEbBoO_n]/.test(code[j])) j++;
      tokens.push({ type: 'number', value: code.slice(i, j) });
      i = j;
      continue;
    }

    // Words (identifiers, keywords)
    if (/[a-zA-Z_$]/.test(code[i])) {
      let j = i;
      while (j < code.length && /[a-zA-Z0-9_$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      let type = 'ident';
      if (JS_KEYWORDS.has(word)) type = 'keyword';
      else if (JS_BUILTINS.has(word)) type = 'builtin';
      // Check if followed by ( → function call
      else {
        let k = j;
        while (k < code.length && code[k] === ' ') k++;
        if (code[k] === '(') type = 'func';
      }
      tokens.push({ type, value: word });
      i = j;
      continue;
    }

    // Operators and punctuation
    if (/[{}()[\];,.:?!<>=+\-*/%&|^~@#]/.test(code[i])) {
      let j = i + 1;
      // Multi-char operators
      if (i + 2 < code.length && /[=!<>]=|=>|\.\.\.|&&|\|\||<<|>>|\*\*|\?\?|\?\./.test(code.slice(i, i + 3))) j = i + 3;
      else if (i + 1 < code.length && /[=!<>]=|=>|&&|\|\||<<|>>|\*\*|\?\?|\?\.|\+\+|--/.test(code.slice(i, i + 2))) j = i + 2;
      tokens.push({ type: 'punct', value: code.slice(i, j) });
      i = j;
      continue;
    }

    // Whitespace / newlines
    if (/\s/.test(code[i])) {
      let j = i;
      while (j < code.length && /\s/.test(code[j]) && code[j] !== '\n') j++;
      if (code[i] === '\n') {
        tokens.push({ type: 'newline', value: '\n' });
        i = i + 1;
      } else {
        tokens.push({ type: 'space', value: code.slice(i, j) });
        i = j;
      }
      continue;
    }

    // Anything else
    tokens.push({ type: 'plain', value: code[i] });
    i++;
  }

  return tokens;
}

const TOKEN_COLORS = {
  keyword:  'var(--syn-keyword)',
  builtin:  'var(--syn-builtin)',
  func:     'var(--syn-func)',
  string:   'var(--syn-string)',
  number:   'var(--syn-number)',
  comment:  'var(--syn-comment)',
  punct:    'var(--syn-punct)',
  ident:    'var(--text-p)',
  space:    null,
  newline:  null,
  plain:    'var(--text-p)',
};

function HighlightedCode({ code }) {
  const tokens = useMemo(() => tokenize(code), [code]);

  return tokens.map((tok, i) => {
    const color = TOKEN_COLORS[tok.type];
    if (!color) return tok.value;
    return <span key={i} style={{ color }}>{tok.value}</span>;
  });
}

export default function CodeBlock({ code, filename, language = 'javascript', output }) {
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [displayedLines, setDisplayedLines] = useState(0);
  const outputRef = useRef(null);

  const outputLines = output ? output.split('\n') : [];
  const codeLines = code.split('\n');

  useEffect(() => {
    if (!running || !outputLines.length) return;
    const timer = setTimeout(() => {
      setRunning(false);
      setShowOutput(true);
      setDisplayedLines(1);
    }, 600);
    return () => clearTimeout(timer);
  }, [running]);

  useEffect(() => {
    if (!showOutput || displayedLines === 0) return;
    if (displayedLines >= outputLines.length) return;
    const timer = setTimeout(() => {
      setDisplayedLines(prev => prev + 1);
    }, 40);
    return () => clearTimeout(timer);
  }, [showOutput, displayedLines, outputLines.length]);

  useEffect(() => {
    if (showOutput && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [displayedLines, showOutput]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleRun = () => {
    if (showOutput) {
      setShowOutput(false);
      setDisplayedLines(0);
      return;
    }
    setRunning(true);
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.dots}>
            <span style={{ ...styles.dot, background: '#FF5F57' }} />
            <span style={{ ...styles.dot, background: '#FFBD2E' }} />
            <span style={{ ...styles.dot, background: '#27C93F' }} />
          </div>
          <span style={styles.lang}>{filename || language}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {output && (
            <button onClick={handleRun} style={{
              ...styles.runBtn,
              ...(running ? styles.runBtnRunning : {}),
            }}>
              {running ? (
                <><span style={styles.runDot} /> Running...</>
              ) : showOutput ? 'Clear' : (
                <><span style={styles.playIcon}>{'▶'}</span> Run</>
              )}
            </button>
          )}
          <button onClick={handleCopy} style={styles.copyBtn}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
      <div style={styles.codeArea}>
        <pre style={styles.lineNums} aria-hidden="true">
          <code>{codeLines.map((_, i) => (i + 1) + '\n')}</code>
        </pre>
        <pre style={styles.pre}>
          <code style={styles.code}><HighlightedCode code={code} /></code>
        </pre>
      </div>
      {(running || showOutput) && (
        <div style={styles.outputWrap}>
          <div style={styles.outputHeader}>
            <span style={styles.outputLabel}>
              {running && <span style={styles.spinner}>{'▶'}</span>}
              {running ? ' stdout' : 'stdout'}
            </span>
          </div>
          <pre style={styles.outputPre} ref={outputRef}>
            {showOutput && (
              <code style={styles.outputCode}>
                {outputLines.slice(0, displayedLines).join('\n')}
                {displayedLines < outputLines.length && (
                  <span style={styles.cursor}>|</span>
                )}
              </code>
            )}
            {running && (
              <code style={styles.outputCode}>
                <span style={styles.cursor}>|</span>
              </code>
            )}
          </pre>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: {
    background: 'var(--bg-code)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    marginBottom: 16,
    marginTop: 12,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--border)',
    background: 'var(--bg-code-header)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  dots: {
    display: 'flex',
    gap: 5,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: '50%',
    opacity: 0.6,
  },
  lang: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.02em',
  },
  copyBtn: {
    fontSize: 10,
    fontWeight: 500,
    color: 'var(--text-muted)',
    background: 'transparent',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '3px 10px',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    transition: 'all var(--dur) var(--ease)',
  },
  runBtn: {
    fontSize: 10,
    fontWeight: 600,
    color: '#fff',
    background: 'var(--bg-accent-strong)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 'var(--radius-sm)',
    padding: '3px 12px',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    transition: 'all var(--dur) var(--ease)',
    letterSpacing: '0.02em',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  runBtnRunning: {
    opacity: 0.7,
    cursor: 'wait',
  },
  playIcon: {
    fontSize: 7,
  },
  runDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#fff',
    display: 'inline-block',
    animation: 'pulse 1s ease-in-out infinite',
  },
  codeArea: {
    display: 'flex',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  lineNums: {
    margin: 0,
    padding: '14px 0 14px 16px',
    textAlign: 'right',
    userSelect: 'none',
    fontSize: 11,
    lineHeight: 1.65,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    opacity: 0.4,
    minWidth: 32,
    flexShrink: 0,
  },
  pre: {
    margin: 0,
    padding: '14px 16px 14px 12px',
    flex: 1,
    minWidth: 0,
  },
  code: {
    fontSize: 12,
    lineHeight: 1.65,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-p)',
    whiteSpace: 'pre',
    tabSize: 2,
  },
  outputWrap: {
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--border)',
    background: '#1a1a2e',
  },
  outputHeader: {
    padding: '5px 12px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  outputLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: '#6ee7b7',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  outputPre: {
    margin: 0,
    padding: '10px 16px',
    overflowX: 'auto',
    maxHeight: 220,
    overflowY: 'auto',
  },
  outputCode: {
    fontSize: 11,
    lineHeight: 1.6,
    fontFamily: 'var(--font-mono)',
    color: '#e2e8f0',
    whiteSpace: 'pre',
  },
  spinner: {
    display: 'inline-block',
    animation: 'pulse 1s ease-in-out infinite',
    color: '#6ee7b7',
  },
  cursor: {
    color: '#6ee7b7',
    animation: 'blink 0.8s step-end infinite',
  },
};

