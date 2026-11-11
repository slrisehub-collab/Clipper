'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Button, ConfirmDialog, Dialog, Input } from './ui';
import { useToast } from './toast';
import { api } from '@/lib/client';

/** Rename / delete menu for a project. */
export function ProjectActions({ id, name, afterDelete = 'refresh' }: { id: string; name: string; afterDelete?: 'refresh' | 'list' }) {
  const router = useRouter();
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/projects/${id}`, { method: 'PATCH', body: { name: value } });
      setRenaming(false);
      router.refresh();
    } catch (err) { toast((err as Error).message, 'error'); } finally { setBusy(false); }
  }

  return (
    <>
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${name}`}><MoreHorizontal className="h-4 w-4" /></Button>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content align="end" sideOffset={4} className="z-50 min-w-[160px] rounded-lg border border-white/[0.08] bg-ink-800 p-1 shadow-2xl">
            <Dropdown.Item onSelect={() => { setValue(name); setRenaming(true); }} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-mist-100 outline-none data-[highlighted]:bg-white/[0.06]">
              <Pencil className="h-3.5 w-3.5" />Rename
            </Dropdown.Item>
            <Dropdown.Item onSelect={() => setDeleting(true)} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-signal-red outline-none data-[highlighted]:bg-signal-red/10">
              <Trash2 className="h-3.5 w-3.5" />Delete
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>

      <Dialog open={renaming} onOpenChange={setRenaming} title="Rename project">
        <form onSubmit={rename} className="space-y-4">
          <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={120} autoFocus aria-label="Project name" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
            <Button type="submit" loading={busy} disabled={!value.trim()}>Save</Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete "${name}"?`}
        description="This removes the source video, every clip and any ZIP downloads in this project. It can't be undone."
        confirmLabel="Delete project"
        onConfirm={async () => {
          try {
            await api(`/api/projects/${id}`, { method: 'DELETE' });
            toast('Project deleted.', 'success');
            if (afterDelete === 'list') router.replace('/app/projects');
            router.refresh();
          } catch (err) { toast((err as Error).message, 'error'); }
        }}
      />
    </>
  );
}
