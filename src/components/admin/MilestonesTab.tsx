import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../store/AuthContext';

interface Milestone {
    id: string;
    year: number;
    title: string;
    description: string;
}

export default function MilestonesTab() {
    const { user } = useAuth();
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [selected, setSelected] = useState<Milestone | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [saving, setSaving] = useState(false);

    // Form state
    const [formId, setFormId] = useState('');
    const [formYear, setFormYear] = useState('');
    const [formTitle, setFormTitle] = useState('');
    const [formDescription, setFormDescription] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'milestones'), orderBy('year', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            })) as Milestone[];
            setMilestones(docs);
        });
        return unsubscribe;
    }, []);

    const resetForm = () => {
        setFormId('');
        setFormYear('');
        setFormTitle('');
        setFormDescription('');
    };

    const startCreate = () => {
        resetForm();
        setSelected(null);
        setIsCreating(true);
    };

    const startEdit = (m: Milestone) => {
        setFormId(m.id);
        setFormYear(String(m.year));
        setFormTitle(m.title);
        setFormDescription(m.description);
        setSelected(m);
        setIsCreating(false);
    };

    const handleSave = async () => {
        const id = formId.trim();
        const year = parseInt(formYear, 10);
        const title = formTitle.trim();
        const description = formDescription.trim();

        if (!id || !year || !title || !description) {
            alert('All fields are required.');
            return;
        }

        setSaving(true);
        try {
            await setDoc(doc(db, 'milestones', id), {
                year,
                title,
                description,
                updated_at: serverTimestamp(),
                updated_by: user?.uid ?? null,
            });
            setSelected(null);
            setIsCreating(false);
            resetForm();
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(`Delete milestone ${id}?`)) return;
        await deleteDoc(doc(db, 'milestones', id));
        if (selected?.id === id) {
            setSelected(null);
            resetForm();
        }
    };

    const showForm = isCreating || selected;

    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-105px)]">
            {/* Left: List */}
            <div className={`${showForm ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-white/10 flex-col`}>
                <div className="flex items-center justify-between p-3 border-b border-white/10">
                    <span className="text-xs text-gray-400 uppercase tracking-widest">
                        {milestones.length} Milestones
                    </span>
                    <button
                        onClick={startCreate}
                        className="px-2 py-1 rounded bg-yellow-400/10 text-yellow-400 text-xs hover:bg-yellow-400/20 transition-colors"
                    >
                        + New
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {milestones.length === 0 && (
                        <div className="text-center text-gray-500 text-sm py-8">
                            No milestones yet. Seed from the hardcoded data or create new ones.
                        </div>
                    )}
                    {milestones.map((m) => (
                        <div
                            key={m.id}
                            onClick={() => startEdit(m)}
                            className={`p-3 rounded cursor-pointer transition-all ${
                                selected?.id === m.id
                                    ? 'bg-yellow-950/50 border-l-2 border-yellow-400'
                                    : 'hover:bg-white/5'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold text-yellow-400">{m.year}</span>
                                <span className="text-xs text-gray-500">{m.id}</span>
                            </div>
                            <div className="text-sm font-medium mt-0.5 line-clamp-1">{m.title}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right: Form */}
            <div className={`${showForm ? 'flex' : 'hidden md:flex'} flex-1 flex-col overflow-y-auto`}>
                {showForm ? (
                    <div className="p-4 md:p-6">
                        {/* Mobile back */}
                        <button
                            onClick={() => { setSelected(null); setIsCreating(false); resetForm(); }}
                            className="mb-4 text-sm text-gray-400 hover:text-white transition-colors md:hidden"
                        >
                            &larr; Back to list
                        </button>

                        <div className="max-w-2xl space-y-4">
                            <h2 className="text-lg font-bold">
                                {isCreating ? 'New Milestone' : `Edit ${selected?.id}`}
                            </h2>

                            {/* ID */}
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">ID (e.g. M15)</label>
                                <input
                                    value={formId}
                                    onChange={(e) => setFormId(e.target.value)}
                                    disabled={!isCreating}
                                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-400/50 disabled:opacity-50"
                                    placeholder="M15"
                                />
                            </div>

                            {/* Year */}
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Year</label>
                                <input
                                    type="number"
                                    value={formYear}
                                    onChange={(e) => setFormYear(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-400/50"
                                    placeholder="2026"
                                    min={1900}
                                    max={2100}
                                />
                            </div>

                            {/* Title */}
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Title</label>
                                <input
                                    value={formTitle}
                                    onChange={(e) => setFormTitle(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-400/50"
                                    placeholder="Key AI Milestone"
                                />
                            </div>

                            {/* Description / Narrative */}
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Narrative</label>
                                <textarea
                                    value={formDescription}
                                    onChange={(e) => setFormDescription(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-yellow-400/50"
                                    placeholder="Tell the story of this milestone — why it mattered, what changed, what followed..."
                                    rows={8}
                                />
                                <div className="text-[10px] text-gray-600 mt-1">
                                    {formDescription.length} characters — aim for 200-500 for a compelling narrative
                                </div>
                            </div>

                            {/* Preview */}
                            {formTitle && formDescription && (
                                <div className="bg-white/5 rounded p-4 border border-white/10">
                                    <div className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Preview</div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="text-lg font-bold text-yellow-400">{formYear || '????'}</span>
                                        <span className="text-base text-white">{formTitle}</span>
                                    </div>
                                    <p className="text-sm text-gray-400 leading-relaxed">{formDescription}</p>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-4 py-2 rounded bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                    {saving ? 'Saving...' : isCreating ? 'Create Milestone' : 'Save Changes'}
                                </button>
                                {!isCreating && selected && (
                                    <button
                                        onClick={() => handleDelete(selected.id)}
                                        className="px-4 py-2 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400 text-sm font-medium transition-colors"
                                    >
                                        Delete
                                    </button>
                                )}
                                <button
                                    onClick={() => { setSelected(null); setIsCreating(false); resetForm(); }}
                                    className="px-4 py-2 rounded text-sm text-gray-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                        Select a milestone to edit or create a new one
                    </div>
                )}
            </div>
        </div>
    );
}
