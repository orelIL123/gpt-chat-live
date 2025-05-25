import React from 'react';
import { BrowserRouter as Router, Route, Switch, Redirect } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import { auth } from './firebase';

const App = () => {
  const PrivateRoute = ({ component: Component, ...rest }) => (
    <Route {...rest} render={props => auth.currentUser ? <Component {...props} /> : <Redirect to="/login" />} />
  );

  return (
    <Router>
      <Switch>
        <Route exact path="/login" component={Login} />
        <Route exact path="/signup" component={Signup} />
        <PrivateRoute path="/dashboard" component={Dashboard} />
        <Redirect to="/login" />
      </Switch>
    </Router>
  );
};

export default App;