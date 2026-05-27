interface MarkdownEditorStorybookProps {
  value: string
  placeholder: string
  ariaLabelledBy?: string
  disabled?: boolean
  onChange: (value: string) => void
}

export default function MarkdownEditorStorybook({
  value,
  placeholder,
  ariaLabelledBy,
  disabled = false,
  onChange,
}: MarkdownEditorStorybookProps): JSX.Element {
  return (
    <div className="markdown-editor-shell markdown-editor-shell--storybook" aria-labelledby={ariaLabelledBy}>
      <div className="markdown-editor-storybook-toolbar" aria-hidden="true">
        <span>B</span>
        <span>I</span>
        <span>H</span>
        <span>•</span>
        <span>1.</span>
        <span>[]</span>
      </div>
      <textarea
        className="textarea markdown-editor-storybook-input"
        value={value}
        aria-labelledby={ariaLabelledBy}
        placeholder={placeholder}
        rows={7}
        maxLength={4000}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
