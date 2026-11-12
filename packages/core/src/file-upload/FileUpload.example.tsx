import { useState } from 'react';
import { Field, FileUpload, type FileRejection } from '@formrail/core';

export function InvoiceAttachments() {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | undefined>();

  const onReject = (rejections: FileRejection[]) =>
    setError(`Not added: ${rejections.map(({ file }) => file.name).join(', ')}. Only PDF files up to 5 MB.`);

  return (
    <Field label="Attachments" help="PDF files up to 5 MB each." error={error}>
      <FileUpload
        value={files}
        accept="application/pdf"
        multiple
        maxSize={5_000_000}
        locale="en"
        onValueChange={(next) => {
          setFiles(next);
          setError(undefined);
        }}
        onReject={onReject}
      />
    </Field>
  );
}
