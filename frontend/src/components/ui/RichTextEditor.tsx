import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  AtSign,
  ToggleLeft,
} from "lucide-react";
import { useEffect } from "react";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
};

/**
 * Per Review 1.1 §2: word-like editor for contract templates.
 * Stores body as HTML. Existing template analyzer regexes `@@name` (per
 * follow-up to Review 1.1, 2026-05-02 — double @@ avoids conflict with
 * literal email addresses like `info@edilteca.it`) and `[[OPTIONAL:id]]…
 * [[/OPTIONAL]]` markers — both work on HTML strings.
 *
 * "Insert @@placeholder" / "Insert OPTIONAL block" buttons inject the markers
 * inline so users don't have to remember the syntax.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = "Start writing the contract template…",
  minHeight = "min-h-72",
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder }),
      Link.configure({ openOnClick: false }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none px-4 py-3 ${minHeight}`,
      },
    },
    immediatelyRender: false,
  });

  // Re-sync external value into editor when the form is reset (e.g. switching templates).
  useEffect(() => {
    if (!editor) return;
    if (value === editor.getHTML()) return;
    editor.commands.setContent(value || "", { emitUpdate: false });
    // Intentionally exclude `editor` from deps to avoid loops on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-2 py-1.5">
      <Btn
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold (Ctrl+B)"
      >
        <BoldIcon className="size-4" />
      </Btn>
      <Btn
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic (Ctrl+I)"
      >
        <ItalicIcon className="size-4" />
      </Btn>
      <Sep />
      <Btn
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title="Heading 1"
      >
        <Heading1 className="size-4" />
      </Btn>
      <Btn
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading 2"
      >
        <Heading2 className="size-4" />
      </Btn>
      <Btn
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Heading 3"
      >
        <Heading3 className="size-4" />
      </Btn>
      <Sep />
      <Btn
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list"
      >
        <List className="size-4" />
      </Btn>
      <Btn
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered list"
      >
        <ListOrdered className="size-4" />
      </Btn>
      <Btn
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Quote"
      >
        <Quote className="size-4" />
      </Btn>
      <Sep />
      <Btn
        active={editor.isActive("link")}
        onClick={() => {
          const url = window.prompt("URL?", editor.getAttributes("link").href ?? "");
          if (url === null) return;
          if (!url) editor.chain().focus().unsetLink().run();
          else editor.chain().focus().setLink({ href: url }).run();
        }}
        title="Link"
      >
        <LinkIcon className="size-4" />
      </Btn>
      <Sep />
      <Btn
        onClick={() => {
          const tag = window.prompt("Placeholder name (letters/numbers/underscore):");
          if (!tag || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(tag)) return;
          editor.chain().focus().insertContent(`@@${tag}`).run();
        }}
        title="Insert @@placeholder"
      >
        <AtSign className="size-4" />
        <span className="text-xs ml-1">tag</span>
      </Btn>
      <Btn
        onClick={() => {
          const id = window.prompt("Optional section id (letters/underscore):");
          if (!id || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) return;
          const label = window.prompt("Optional section label (shown to renderer):", id) ?? id;
          editor
            .chain()
            .focus()
            .insertContent(`[[OPTIONAL:${id}|${label}]]\n\n[[/OPTIONAL]]`)
            .run();
        }}
        title="Insert OPTIONAL block"
      >
        <ToggleLeft className="size-4" />
        <span className="text-xs ml-1">optional</span>
      </Btn>
    </div>
  );
}

function Btn({
  children,
  active,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center px-2 py-1 rounded-md text-sm transition ${
        active
          ? "bg-brand-100 text-brand-700"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="mx-1 h-5 w-px bg-slate-200" />;
}
