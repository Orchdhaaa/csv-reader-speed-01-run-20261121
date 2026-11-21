// Fast drop-in for make.fun's csv-reader 1.0.0: run(input) returns exactly csv-reader's
// answer {columns, rows, errors} for {text, header}, faster.
//
// Semantics (csv-reader 1.0.0, kit RULES.txt): the text is read once, left to right.
// A U+FEFF at the very start is dropped. A record ends at LF or CRLF; a line left with
// no characters is no record. Outside quotes a CR not followed by LF is dropped
// (stray_cr). A field that opens with a quote runs to the next quote that is not
// doubled ("" inside is one quote; each CRLF or lone CR inside is read as LF); what
// follows its closing quote, up to the next comma or line break, is appended as it
// stands (quote_junk, when the field ends). A quote that never closes is a literal
// character, and the text after it is read again as unquoted (unterminated_quote). A
// quote inside an unquoted field is a literal character. Fields stay strings, never
// trimmed or converted. columns is the first record when header is true, else null;
// rows holds the records after it, each padded with "" (short_row, with fields: its
// field count) or cut (long_row, with extra: the cut fields) to the first record's
// width. Each error is {code, line, row}, in the order met; line is the 1-based line
// its record starts on, row its record's index in rows (null for the header).
//
// Speed: one left-to-right pass, no per-character string building, no helper call
// per field. Unquoted fields are found by one tight charCodeAt scan, inlined in the
// record loop, and taken as a single slice; quoted fields find their closing quote
// with indexOf (skipping doubled quotes) and are taken as one slice when they hold
// no doubled quote and no line break. Only broken fields (stray CRs, doubled quotes,
// line breaks inside quotes) take the segment path. Junk kept after a closing quote
// is measured as value.length minus the quoted prefix, so the scan tracks no count.

const COMMA = 0;
const BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let pos = 0;
  let line = 1;
  if (n !== 0 && text.charCodeAt(0) === 0xFEFF) pos = 1;

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos++;
        line++;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended = COMMA;
    let quoted = false;

    while (ended === COMMA) {
      // Read one field. `prefix` is the value so far when an unquoted scan is
      // needed ('' for a plain field, '"' for an unterminated re-read, the quoted
      // content for junk after a closing quote); `needScan` says the field is not
      // finished yet and the shared scan below reads it. `junkBase` is the quoted
      // value whose length the junk count is measured against, or -1.
      let value;
      let prefix = '';
      let needScan = true;
      let junkBase = -1;
      if (text.charCodeAt(pos) === 34) {
        quoted = true;
        const open = pos;
        const openLine = line;
        let scan = pos + 1;
        let segStart = pos + 1;
        let built = null;
        let close = -1;
        for (;;) {
          const q = text.indexOf('"', scan);
          if (q < 0) break;
          if (text.charCodeAt(q + 1) === 34) {
            built = built === null ? text.slice(segStart, q) : built + text.slice(segStart, q);
            built += '"';
            scan = q + 2;
            segStart = q + 2;
          } else {
            close = q;
            break;
          }
        }
        if (close < 0) {
          // The quote never closes: it is a literal character, and the text after
          // it is read again as unquoted.
          pos = open + 1;
          line = openLine;
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          prefix = '"';
        } else {
          // The quoted content is (open+1 .. close), doubled quotes resolved.
          // (Checked on the content slice itself, so the search never runs past
          // the closing quote: an unbounded indexOf here would scan the rest of
          // the file whenever the file holds no such break.)
          const content = text.slice(open + 1, close);
          const hasCR = content.indexOf('\r') >= 0;
          const hasLF = content.indexOf('\n') >= 0;
          if (!hasCR && !hasLF) {
            value = built === null ? content : built + text.slice(segStart, close);
          } else {
            // Line breaks inside quotes: each CRLF or lone CR is one LF, and every
            // line break counts one line.
            let v = '';
            let s = open + 1;
            let i = open + 1;
            while (i < close) {
              const c = text.charCodeAt(i);
              if (c === 34) {
                v += text.slice(s, i) + '"';
                i += 2;
                s = i;
              } else if (c === 13) {
                v += text.slice(s, i) + '\n';
                line++;
                i += text.charCodeAt(i + 1) === 10 ? 2 : 1;
                s = i;
              } else if (c === 10) {
                v += text.slice(s, i) + '\n';
                line++;
                i++;
                s = i;
              } else {
                i++;
              }
            }
            v += text.slice(s, close);
            value = v;
          }
          pos = close + 1;
          if (pos >= n) {
            ended = END;
            needScan = false;
          } else {
            const c = text.charCodeAt(pos);
            if (c === 44) {
              pos++;
              ended = COMMA;
              needScan = false;
            } else if (c === 10) {
              pos++;
              line++;
              ended = BREAK;
              needScan = false;
            } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
              pos += 2;
              line++;
              ended = BREAK;
              needScan = false;
            } else {
              // What follows the closing quote is appended as it stands, up to the
              // next comma or line break.
              prefix = value;
              junkBase = value.length;
            }
          }
        }
      } else {
        quoted = false;
      }

      if (needScan) {
        // Shared unquoted scan from `pos`, starting from `prefix`: finds the next
        // comma, LF, CRLF or end of text; a lone CR is dropped (stray_cr) and the
        // field goes on. The field is one slice unless a stray CR split it.
        value = prefix;
        let i = pos;
        let segStart = pos;
        let segs = null;
        for (;;) {
          while (i < n) {
            const c = text.charCodeAt(i);
            if (c === 44 || c === 10 || c === 13) break;
            i++;
          }
          if (i >= n) {
            ended = END;
            break;
          }
          const c = text.charCodeAt(i);
          if (c === 13 && text.charCodeAt(i + 1) !== 10) {
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            if (segs === null) segs = text.slice(segStart, i);
            else segs += text.slice(segStart, i);
            i++;
            segStart = i;
            continue;
          }
          ended = c === 44 ? COMMA : BREAK;
          break;
        }
        value += segs === null ? text.slice(segStart, i) : segs + text.slice(segStart, i);
        if (ended === COMMA) {
          pos = i + 1;
        } else if (ended === BREAK) {
          line++;
          pos = text.charCodeAt(i) === 13 ? i + 2 : i + 1;
        } else {
          pos = i;
        }
        if (junkBase >= 0 && value.length - junkBase > 0) {
          errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        }
      }
      fields.push(value);
    }

    // A line that held only stray CRs is left with no characters: no record (its
    // stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
