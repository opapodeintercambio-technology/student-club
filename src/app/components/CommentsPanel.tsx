import { useState, useEffect } from 'react';
import { X, Send, Trash2, MessageCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useLang } from '../i18n';

interface Comment {
  id: string;
  anuncio_id: string;
  username: string;
  texto: string;
  created_at: string;
}

interface CommentsPanelProps {
  anuncioId: string;
  anuncioTitle: string;
  currentUser: string;
  onClose: () => void;
}

export function CommentsPanel({ anuncioId, anuncioTitle, currentUser, onClose }: CommentsPanelProps) {
  const { AT } = useLang();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadComments();
  }, [anuncioId]);

  async function loadComments() {
    setLoading(true);
    const { data } = await supabase
      .from('comentarios')
      .select('*')
      .eq('anuncio_id', anuncioId)
      .order('created_at', { ascending: true });
    setComments(data || []);
    setLoading(false);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    await supabase.from('comentarios').insert({
      anuncio_id: anuncioId,
      username: currentUser,
      texto: text.trim(),
    });
    setText('');
    await loadComments();
    setSending(false);
  }

  async function handleDelete(id: string) {
    await supabase.from('comentarios').delete().eq('id', id);
    setComments(prev => prev.filter(c => c.id !== id));
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return AT.productCardNow;
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-purple-600" />
            <h3 className="font-bold text-gray-800 truncate max-w-[220px]">{anuncioTitle}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loading ? (
            <p className="text-center text-gray-400 py-8 text-sm">{AT.commentsLoading}</p>
          ) : comments.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">{AT.commentsEmpty}</p>
          ) : (
            comments.map(c => (
              <div key={c.id} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-xs flex-shrink-0">
                  {c.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 bg-gray-50 rounded-2xl px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-gray-800">@{c.username}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{timeAgo(c.created_at)}</span>
                      {c.username === currentUser && (
                        <button onClick={() => handleDelete(c.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 mt-0.5">{c.texto}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="px-4 py-3 border-t border-gray-100 flex gap-2">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={AT.commentsPlaceholder}
            className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-2xl focus:border-purple-500 outline-none text-sm"
            maxLength={300}
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="bg-purple-600 text-white px-4 py-2.5 rounded-2xl hover:bg-purple-700 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
