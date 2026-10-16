/**
 * Documents for the demo's media library, generated without external tools. (The library
 * accepts images, mp4/mov video and PDF/DOCX documents; audio and SVG uploads aren't allowed.)
 */

/**
 * A small, valid PDF with text pages (Helvetica, WinAnsi encoding, so French accents work).
 * Each page is a title plus paragraphs, wrapped at ~90 characters.
 */
export function pdf(pages: Array<{ title: string; paragraphs: string[] }>): Buffer {
    const objects: string[] = [];
    const add = (body: string) => {
        objects.push(body);
        return objects.length;
    };
    const fontId = add(
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    );
    const boldId = add(
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    );
    const pagesId = add('PAGES_PLACEHOLDER');
    const pageIds: number[] = [];
    const pdfText = (s: string) =>
        s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

    for (const page of pages) {
        const lines: string[] = [
            'BT',
            '/F2 22 Tf',
            '56 780 Td',
            `(${pdfText(page.title)}) Tj`,
            '/F1 11 Tf',
            '0 -34 Td',
            '15 TL'
        ];
        for (const para of page.paragraphs) {
            let line = '';
            for (const word of para.split(/\s+/)) {
                if ((line + ' ' + word).length > 90) {
                    lines.push(`(${pdfText(line)}) Tj T*`);
                    line = word;
                } else line = (line + ' ' + word).trim();
            }
            if (line) lines.push(`(${pdfText(line)}) Tj T*`);
            lines.push('T*');
        }
        lines.push('ET');
        const stream = lines.join('\n');
        const contentId = add(
            `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
        );
        pageIds.push(
            add(
                `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${contentId} 0 R >>`
            )
        );
    }
    objects[pagesId - 1] =
        `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets: number[] = [];
    objects.forEach((body, i) => {
        offsets.push(Buffer.byteLength(out, 'latin1'));
        out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
}
