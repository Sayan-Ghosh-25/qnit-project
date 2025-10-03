// src/components/MindGame.jsx
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import styles from "./MindGame.module.css";

const symbols = ["😎", "🚀", "🎯", "📚", "💡", "🧩","⭐", "🤖"];

export default function MindGame() {
  const [cards, setCards] = useState([]);
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState([]);
  const [moves, setMoves] = useState(0);

  // Initialize game
  useEffect(() => {
    restartGame();
  }, []);

  // Enhanced shuffle with layout animation
  const shuffleCards = () => {
    const duplicated = [...symbols, ...symbols];
    const shuffled = duplicated
      .sort(() => Math.random() - 0.5)
      .map((s, i) => ({ id: i, symbol: s }));
    setCards(shuffled);
  };

  const handleFlip = (card) => {
    if (flipped.length === 2 || flipped.find(f => f.id === card.id) || matched.includes(card.symbol)) return;

    const newFlipped = [...flipped, card];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      setMoves(prev => prev + 1);
      const isMatch = newFlipped[0].symbol === newFlipped[1].symbol;

      if (isMatch) {
        setMatched(prev => [...prev, newFlipped[0].symbol]);
      }

      setTimeout(() => setFlipped([]), 1000);
    }
  };

  const restartGame = () => {
    setFlipped([]);
    setMatched([]);
    setMoves(0);
    shuffleCards();
  };

  // Variants for the flip animation
  const cardVariants = {
    front: { rotateY: 0 },
    back: { rotateY: 180 },
  };

  return (
    <section className={styles.puzzleSection}>
      <h2>Memory Puzzle Game</h2>
      <p>Test Your Memory & Logic Skills! Moves: {moves}</p>

      {/* Layout animation container */}
      <motion.div 
        layout 
        className={styles.grid}
      >
        <AnimatePresence>
          {cards.map((card) => {
            const isCardFlipped = flipped.find(f => f.id === card.id) || matched.includes(card.symbol);
            return (
              <motion.div
                key={card.id}
                layout
                className={styles.card}
                onClick={() => handleFlip(card)}
              >
                {/* Back of Card */}
                <motion.div
                  className={styles.back}
                  variants={cardVariants}
                  initial="front"
                  animate={isCardFlipped ? "back" : "front"}
                  transition={{ duration: 0.5 }}
                >
                  ?
                </motion.div>

                {/* Front of Card */}
                <motion.div
                  className={styles.front}
                  variants={cardVariants}
                  initial="back"
                  animate={isCardFlipped ? "front" : "back"}
                  transition={{ duration: 0.5 }}
                >
                  {card.symbol}
                </motion.div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {/* Win message with animation */}
      <AnimatePresence>
        {matched.length === symbols.length && (
          <motion.div
            className={styles.win}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            Congratulations! You Solved The Puzzle In {moves} Moves <br />
            <motion.button 
              onClick={restartGame}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              Play Again
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}