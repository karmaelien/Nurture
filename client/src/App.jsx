import { useEffect, useState } from 'react'

export default function App() {
  const [status, setStatus] = useState('Checking API connection…')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/health', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('API request failed')
        return response.json()
      })
      .then((data) => setStatus(data.message))
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setStatus('API unavailable. Start the backend to connect.')
        }
      })
    return () => controller.abort()
  }, [])

  return (
    <main>
      <p className="eyebrow">Family care, together</p>
      <h1>Nurture</h1>
      <p>Your shared space for care schedules, expenses, and documents.</p>
      <section aria-labelledby="setup-heading">
        <h2 id="setup-heading">Project starter</h2>
        <p>React and Express are ready for development.</p>
        <p role="status">{status}</p>
      </section>
    </main>
  )
}
