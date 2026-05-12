import { Sparkles, X } from 'lucide-react';
import type { Product } from './ProductCard';
import { useLang } from '../i18n';

interface MatchSuggestionsProps {
  matches: Product[];
  onClose: () => void;
  onSelectMatch: (product: Product) => void;
}

export function MatchSuggestions({ matches, onClose, onSelectMatch }: MatchSuggestionsProps) {
  const { AT } = useLang();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto border-4 border-orange-500">
        <div className="sticky top-0 bg-orange-500 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6" />
            <h2 className="text-2xl font-bold">{AT.matchSuggestionsTitle}</h2>
          </div>
          <button onClick={onClose} className="text-white hover:text-gray-200">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-gray-600 mb-6">
            {AT.matchSuggestionsFound(matches.length)}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matches.map((match) => (
              <div
                key={match.id}
                className="border-2 border-gray-300 p-4 hover:border-orange-500 hover:shadow-md transition-all cursor-pointer"
                onClick={() => onSelectMatch(match)}
              >
                <div className="flex gap-4">
                  {match.image ? (
                    <img
                      src={match.image}
                      alt={match.title}
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-lg flex flex-col items-center justify-center gap-1 flex-shrink-0" style={{ background: '#111' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      <span style={{ color: '#888', fontSize: 9, fontWeight: 700 }}>sem foto</span>
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-bold text-gray-800">{match.title}</h3>
                      {match.matchScore && (
                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium">
                          {match.matchScore}%
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                      {match.description}
                    </p>
                    <div className="bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      <p className="text-xs text-amber-800">{AT.matchSuggestionsWants(match.wantsInExchange)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {matches.length === 0 && (
            <div className="text-center py-12">
              <Sparkles className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">{AT.matchSuggestionsEmpty}</p>
              <p className="text-sm text-gray-400 mt-2">{AT.matchSuggestionsEmptyHint}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
