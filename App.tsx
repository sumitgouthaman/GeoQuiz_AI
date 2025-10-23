import React, { useState, useEffect, useCallback } from 'react';
import { Question, GameStatus, GroundingChunk, CountryInfo } from './types';
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
  const [userAnswer, setUserAnswer] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [spellingMistake, setSpellingMistake] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [info, setInfo] = useState<CountryInfo | null>(null);
  const [countryImage, setCountryImage] = useState<string | null>(null);
  const [sources, setSources] = useState<GroundingChunk[]>([]);
  const [error, setError] = useState<string | null>(null);

  const setupNewQuestion = useCallback(async () => {
    setGameStatus('loading_question');
    setIsCorrect(null);
    setSpellingMistake(false);
    setUserAnswer('');
    setHint(null);
    setInfo(null);
    setCountryImage(null);
    setSources([]);
    setError(null);
    
    try {
      const randomCountry = await getRandomCountry();
      if (!randomCountry) {
        throw new Error("Could not fetch a new country.");
      }
      const questionType = Math.random() > 0.5 ? 'ask_capital' : 'ask_country';
      setCurrentQuestion({ country: randomCountry, type: questionType });
      setGameStatus('playing');
    } catch (e) {
      setError("Failed to start a new round. Please refresh the page.");
      setGameStatus('error');
    }
  }, []);

  useEffect(() => {
    setupNewQuestion();
  }, [setupNewQuestion]);

  const handleHintRequest = async () => {
    if (!currentQuestion) return;
    setGameStatus('loading_hint');
    try {
      const hintText = await getHint(currentQuestion);
      setHint(hintText);
    } catch (e) {
      setError("Failed to fetch a hint.");
    } finally {
      setGameStatus('playing');
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
    setGameStatus('loading_info');
    
    try {
      const { info, sources } = await getCountryInfo(currentQuestion.country.name, currentQuestion.country.capital);
      setInfo(info);
      setSources(sources);
      if (info?.photoPrompt) {
          const imageData = await getCountryImage(info.photoPrompt);
          setCountryImage(imageData);
      }
    } catch (e) {
      setError("Failed to fetch country information.");
    } finally {
      setGameStatus('answered');
    }
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
        return renderLoadingView("Putting together some cool info for you...");
      case 'loading_question':
          return renderLoadingView("Fetching a new challenge...");
      default:
        return <LoadingSpinner size={12} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <header className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-800">Geo Genius</h1>
            <p className="text-lg text-gray-600 mt-2">How well do you know the world?</p>
        </header>
        <main className="bg-white rounded-xl shadow-lg p-6 sm:p-8 transition-all duration-300 min-h-[400px] flex items-center justify-center">
            {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default App;