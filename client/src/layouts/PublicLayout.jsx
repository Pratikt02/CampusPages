import { Outlet } from 'react-router-dom';
import { PublicNavbar } from '../components/PublicNavbar.jsx';
import { Footer } from '../components/Footer.jsx';

export default function PublicLayout() {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <PublicNavbar />
      <main id="main"><Outlet /></main>
      <Footer />
    </>
  );
}
