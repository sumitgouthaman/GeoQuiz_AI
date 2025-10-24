import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Question, GameStatus, GroundingChunk, CountryInfo, QuestionType } from './types';
import { getHint, getCountryInfo, getCountryImage, getRandomCountry } from './services/geminiService';
import LoadingSpinner from './components/LoadingSpinner';

const levenshteinDistance = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
};

const App: React.FC = () => {
  const [gameStatus, setGameStatus] = useState<GameStatus>('loading_question');
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [nextQuestion, setNextQuestion] = useState<Question | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [spellingMistake, setSpellingMistake] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [info, setInfo] = useState<CountryInfo | null>(null);
  const [countryImage, setCountryImage] = useState<string | null>(null);
  const [sources, setSources] = useState<GroundingChunk[]>([]);
  const [error, setError] = useState<string | null>(null);

  const prefetchedInfoPromiseRef = useRef<Promise<{ info: CountryInfo | null; sources: GroundingChunk[] }> | null>(null);
  const prefetchedImagePromiseRef = useRef<Promise<string | null> | null>(null);
  const prefetchedHintPromiseRef = useRef<Promise<string> | null>(null);

  const prefetchAnswerDetails = useCallback((question: Question | null) => {
    if (!question) {
      prefetchedInfoPromiseRef.current = null;
      prefetchedImagePromiseRef.current = null;
      prefetchedHintPromiseRef.current = null;
      return;
    }
    const infoPromise = getCountryInfo(question.country.name, question.country.capital);
    prefetchedInfoPromiseRef.current = infoPromise;

    const imagePromise = infoPromise.then(({ info }) => {
      if (info?.photoPrompt) {
        return getCountryImage(info.photoPrompt);
      }
      return Promise.resolve(null);
    });
    prefetchedImagePromiseRef.current = imagePromise;
    prefetchedHintPromiseRef.current = getHint(question);
  }, []);

  const setupNewQuestion = useCallback(async () => {
    setIsCorrect(null);
    setSpellingMistake(false);
    setUserAnswer('');
    setHint(null);
    setInfo(null);
    setCountryImage(null);
    setSources([]);
    setError(null);
    
    if (nextQuestion) {
      setCurrentQuestion(nextQuestion);
      prefetchAnswerDetails(nextQuestion);
      setNextQuestion(null);
      setGameStatus('playing');
    } else {
      setGameStatus('loading_question');
      try {
        const randomCountry = await getRandomCountry();
        if (!randomCountry) {
          throw new Error("Could not fetch a new country.");
        }
        // FIX: Explicitly define the type as QuestionType to prevent it from being inferred as a generic string.
        const questionType: QuestionType = Math.random() > 0.5 ? 'ask_capital' : 'ask_country';
        const newQuestion = { country: randomCountry, type: questionType };
        setCurrentQuestion(newQuestion);
        prefetchAnswerDetails(newQuestion);
        setGameStatus('playing');
      } catch (e) {
        setError("Failed to start a new round. Please refresh the page.");
        setGameStatus('error');
      }
    }
  }, [nextQuestion, prefetchAnswerDetails]);

  // Effect for initial load only
  useEffect(() => {
    setupNewQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleHintRequest = async () => {
    if (!currentQuestion) return;
    setGameStatus('loading_hint');
    try {
      if (prefetchedHintPromiseRef.current) {
        const hintText = await prefetchedHintPromiseRef.current;
        setHint(hintText);
      } else {
        // Fallback in case prefetching failed
        const hintText = await getHint(currentQuestion);
        setHint(hintText);
      }
    } catch (e) {
      setError("Failed to fetch a hint.");
    } finally {
      setGameStatus('playing');
    }
  };

  const moveToAnswerScreen = async () => {
    // Pre-fetch the next question in the background.
    getRandomCountry().then(country => {
        if (country) {
            const type: QuestionType = Math.random() > 0.5 ? 'ask_capital' : 'ask_country';
            setNextQuestion({ country, type });
        }
    }).catch(err => {
        console.error("Failed to pre-fetch next question:", err);
    });
    
    setGameStatus('loading_info');
    try {
      const infoPromise = prefetchedInfoPromiseRef.current;
      const imagePromise = prefetchedImagePromiseRef.current;

      const [{ info, sources }, imageData] = await Promise.all([
          infoPromise || Promise.resolve({ info: null, sources: [] }),
          imagePromise || Promise.resolve(null)
      ]);
      
      setInfo(info);
      setSources(sources);
      setCountryImage(imageData);
    } catch (e) {
      setError("Failed to fetch country information.");
    } finally {
      setGameStatus('answered');
    }
  };

  const handleAnswerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentQuestion || !userAnswer.trim()) return;

    const correctAnswer = currentQuestion.type === 'ask_capital' 
      ? currentQuestion.country.capital 
      : currentQuestion.country.name;
    
    const normalize = (str: string) => str.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g,"").replace(/\s+/g, ' ').trim();
    const normalizedUserAnswer = normalize(userAnswer);
    const normalizedCorrectAnswer = normalize(correctAnswer);
    
    const distance = levenshteinDistance(normalizedUserAnswer, normalizedCorrectAnswer);
    const isVeryClose = distance <= 2 && normalizedCorrectAnswer.length > 3;
    const perfectMatch = normalizedUserAnswer === normalizedCorrectAnswer;

    const correct = perfectMatch || isVeryClose;
    setIsCorrect(correct);
    setSpellingMistake(correct && !perfectMatch);
    
    await moveToAnswerScreen();
  };

  const handleGiveUp = async () => {
    if (!currentQuestion) return;
    setIsCorrect(false);
    setSpellingMistake(false);
    setUserAnswer('');
    await moveToAnswerScreen();
  };

  const renderQuizView = () => {
    if (!currentQuestion) return <LoadingSpinner size={12} />;

    const questionText = currentQuestion.type === 'ask_capital'
      ? `What is the capital of ${currentQuestion.country.name}?`
      : `Which country's capital is ${currentQuestion.country.capital}?`;

    return (
      <div className="flex flex-col items-center justify-center w-full text-center">
        <h2 className="text-3xl font-bold text-gray-800 mb-6">{questionText}</h2>
        {hint && (
          <div className="mb-4 p-3 bg-blue-100 border-l-4 border-blue-500 text-blue-700 w-full max-w-md">
            <p><span className="font-bold">Hint:</span> {hint}</p>
          </div>
        )}
        <form onSubmit={handleAnswerSubmit} className="w-full max-w-md flex flex-col gap-4">
          <input
            type="text"
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition text-lg"
            placeholder="Your answer..."
            disabled={gameStatus === 'loading_hint'}
            aria-label="Your Answer"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button type="submit" className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:bg-blue-300 shadow-sm" disabled={gameStatus === 'loading_hint'}>
              Submit
            </button>
            <button type="button" onClick={handleHintRequest} className="bg-gray-200 text-gray-800 px-6 py-3 rounded-lg font-semibold hover:bg-gray-300 transition disabled:bg-gray-100 flex items-center justify-center" disabled={gameStatus === 'loading_hint'}>
              {gameStatus === 'loading_hint' ? <LoadingSpinner size={5} /> : 'I need a hint'}
            </button>
          </div>
           <button 
            type="button" 
            onClick={handleGiveUp} 
            className="text-center text-gray-500 hover:text-gray-700 disabled:text-gray-300 transition hover:underline"
            disabled={gameStatus === 'loading_hint'}
          >
            I give up
          </button>
        </form>
      </div>
    );
  };

  const renderAnswerView = () => {
    if (!currentQuestion) return null;

    const resultText = isCorrect ? "Correct!" : "Not quite...";
    const resultColor = isCorrect ? "text-green-600" : "text-red-600";
    const correctAnswerText = currentQuestion.type === 'ask_capital'
      ? `The capital of ${currentQuestion.country.name} is ${currentQuestion.country.capital}.`
      : `${currentQuestion.country.capital} is the capital of ${currentQuestion.country.name}.`;

    return (
      <div className="flex flex-col gap-4 w-full">
        <h2 className={`text-3xl font-bold text-center ${resultColor}`}>{resultText}</h2>
        {spellingMistake && <p className="text-center text-orange-600">The correct spelling is <span className="font-bold">{currentQuestion.type === 'ask_capital' ? currentQuestion.country.capital : currentQuestion.country.name}</span>.</p>}
        {!isCorrect && <p className="text-center text-lg text-gray-700">{correctAnswerText}</p>}
        
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
          <h3 className="text-xl font-semibold text-gray-800 mb-2">Learn More</h3>
          {info ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <p className="text-gray-700 mb-3">{info.summary}</p>
                    <h4 className="font-semibold text-gray-700">Fun Facts:</h4>
                    <ul className="list-disc list-inside text-gray-600 space-y-1">
                        {info.facts.map((fact, i) => <li key={i}>{fact}</li>)}
                    </ul>
                </div>
                <div className="space-y-4">
                    {countryImage ? (
                         <img src={`data:image/png;base64,${countryImage}`} alt={`A scene from ${currentQuestion.country.name}`} className="rounded-lg shadow-md w-full h-48 object-cover" />
                    ) : (
                        <div className="rounded-lg bg-gray-200 w-full h-48 flex items-center justify-center"><LoadingSpinner/></div>
                    )}
                    <iframe
                        className="w-full h-48 rounded-lg border-0"
                        loading="lazy"
                        allowFullScreen
                        src={`https://www.google.com/maps/embed/v1/place?key=${process.env.API_KEY}&q=${encodeURIComponent(info.mapQuery)}`}>
                    </iframe>
                </div>
            </div>
          ) : (
             <p className="text-gray-600">No additional information available.</p>
          )}
        </div>
        
        {sources && sources.length > 0 && (
          <div className="mt-2">
            <h4 className="text-md font-semibold text-gray-700">Sources:</h4>
            <ul className="list-disc list-inside text-sm">
              {sources.map((source, index) => {
                const link = source.web || source.maps;
                if (!link?.uri) return null;
                return (
                   <li key={index} className="truncate">
                    <a href={link.uri} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                      {link.title || link.uri}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <button onClick={setupNewQuestion} className="w-full mt-4 bg-green-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600 transition">
          Next Question
        </button>
      </div>
    );
  };
  
  const renderLoadingView = (text: string) => (
    <div className="flex flex-col items-center justify-center gap-4 text-gray-600">
        <LoadingSpinner size={12}/>
        <p>{text}</p>
    </div>
  )

  const renderContent = () => {
    if (error) {
      return <div className="text-red-500 text-center">{error}</div>;
    }

    switch (gameStatus) {
      case 'playing':
      case 'loading_hint':
        return renderQuizView();
      case 'answered':
        return renderAnswerView();
      case 'loading_info':
        return renderLoadingView("Putting together some cool info...");
      case 'loading_question':
        return renderLoadingView("Fetching a new challenge...");
      case 'error':
        return <div className="text-red-500 text-center">{error}</div>;
      default:
        return <LoadingSpinner size={12} />;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <main className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 w-full max-w-2xl min-h-[400px] flex items-center justify-center">
            {renderContent()}
        </main>
    </div>
  );
};

export default App;
