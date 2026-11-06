import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { UploadDropzone } from '@/components/library/UploadDropzone'

describe('UploadDropzone', () => {
  it('uploads the chosen file with the selected material type', async () => {
    const user = userEvent.setup()
    const onUpload = vi.fn().mockResolvedValue(undefined)
    render(<UploadDropzone onUpload={onUpload} />)

    await user.selectOptions(
      screen.getByLabelText('Material type'),
      'handout',
    )
    const file = new File(['Deadlocks need mutual exclusion.'], 'syllabus.txt', {
      type: 'text/plain',
    })
    await user.upload(screen.getByLabelText('Upload document'), file)

    expect(onUpload).toHaveBeenCalledWith(file, 'handout')
  })

  it('rejects unsupported file types before uploading', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const onUpload = vi.fn()
    render(<UploadDropzone onUpload={onUpload} />)

    const file = new File(['MZ'], 'virus.exe', {
      type: 'application/octet-stream',
    })
    await user.upload(screen.getByLabelText('Upload document'), file)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Upload a PDF, PPTX, DOCX, TXT or MD file.',
    )
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('shows the error reported by the upload request', () => {
    render(<UploadDropzone onUpload={vi.fn()} error="Files must be 25 MB or smaller." />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Files must be 25 MB or smaller.',
    )
  })
})
