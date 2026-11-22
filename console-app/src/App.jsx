import Sidebar from './components/Sidebar.jsx';
import RunHeader from './components/RunHeader.jsx';
import StatTiles from './components/StatTiles.jsx';
import PayByCountry from './components/PayByCountry.jsx';
import RunProgress from './components/RunProgress.jsx';
import PeopleTable from './components/PeopleTable.jsx';
import ReviewQueue from './components/ReviewQueue.jsx';
import Activity from './components/Activity.jsx';
import Page from './components/Page.jsx';
import './App.css';

export default function App() {
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <RunHeader />
        <div className="workspace">
          <div className="content">
            <StatTiles />
            <div className="charts">
              <PayByCountry />
              <RunProgress />
            </div>
            <PeopleTable />
          </div>
          <aside className="rail">
            <ReviewQueue />
            <Page />
            <Activity />
          </aside>
        </div>
      </main>
    </div>
  );
}
