// Lixeira que aparece no rodape central do stage durante o arrasto de uma
// camada. Quando o user sobrepoe (overTrash=true), o circulo cresce + fica
// vermelho — feedback visual claro de "soltar aqui pra deletar".

import { motion, AnimatePresence } from 'motion/react';
import { Trash2 } from 'lucide-react';

interface Props {
  visible: boolean;
  overTrash: boolean;
}

export function TrashZone({ visible, overTrash }: Props) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute left-1/2 z-40 pointer-events-none"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}
          initial={{ opacity: 0, x: '-50%', y: 20 }}
          animate={{ opacity: 1, x: '-50%', y: 0 }}
          exit={{ opacity: 0, x: '-50%', y: 20 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="flex items-center justify-center rounded-full"
            animate={{
              width: overTrash ? 80 : 60,
              height: overTrash ? 80 : 60,
              backgroundColor: overTrash ? '#dc2626' : 'rgba(0,0,0,0.62)',
            }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            style={{
              border: '2px solid rgba(255,255,255,0.4)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
          >
            <Trash2 className="w-7 h-7 text-white" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
