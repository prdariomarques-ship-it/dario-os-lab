import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import Agents from "./pages/Agents";
import Memory from "./pages/Memory";
import Skills from "./pages/Skills";
import Logs from "./pages/Logs";
import Finance from "./pages/Finance";

const nav = [
  { to: "/", label: "Dashboard" },
  { to: "/finance", label: "Finance" },
  { to: "/tasks", label: "Tasks" },
  { to: "/agents", label: "Agents" },
  { to: "/memory", label: "Memory" },
  { to: "/skills", label: "Skills" },
  { to: "/logs", label: "Logs" },
];

function Sidebar() {
  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-64 bg-dark-800 border-r border-dark-700 min-h-screen p-4 flex-col">
        <div className="text-xl font-bold text-white mb-8">DARIUS STITCH</div>
        <nav className="flex flex-col gap-2">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className="text-gray-300 hover:text-white p-2">
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
      {/* Mobile top nav (mobile-first) */}
      <div className="md:hidden bg-dark-800 border-b border-dark-700 px-2 py-3">
        <div className="text-lg font-bold text-white mb-2 px-2">DARIUS</div>
        <nav className="flex gap-1 overflow-x-auto">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="text-gray-300 hover:text-white whitespace-nowrap text-sm px-3 py-1.5 rounded bg-dark-900"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col md:flex-row bg-dark-900 min-h-screen text-gray-200">
        <Sidebar />
        <main className="flex-1 p-4 md:p-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/memory" element={<Memory />} />
            <Route path="/skills" element={<Skills />} />
            <Route path="/logs" element={<Logs />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
