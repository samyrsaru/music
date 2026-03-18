import { BrowserRouter, Routes, Route } from 'react-router'
import { Layout } from './components/Layout'
import Home from './pages/Home'
import Studio from './pages/Studio'
import MyMusic from './pages/MyMusic'
import Song from './pages/Song'
import EphemeralSong from './pages/EphemeralSong'
import Account from './pages/Account'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsOfService from './pages/TermsOfService'
import NotFound from './pages/NotFound'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route element={<Layout />}>
          <Route path="/studio" element={<Studio />} />
          <Route path="/library" element={<MyMusic />} />
          <Route path="/song/:id" element={<Song />} />
          <Route path="/ephemeral/:id" element={<EphemeralSong />} />
          <Route path="/account" element={<Account />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
