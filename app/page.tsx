import { QuizGame } from "@/components/game/QuizGame";

/**
 * Full-page Marketplace extension point → the Sitecorex SAI Quiz.
 * The game self-connects to the Marketplace SDK when embedded in the Cloud
 * Portal (live tenant questions) and falls back to sample data standalone.
 */
export default function Page() {
  return <QuizGame />;
}
