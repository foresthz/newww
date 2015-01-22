require('dotenv').load();

var Code = require('code'),
    Lab = require('lab'),
    lab = exports.lab = Lab.script(),
    describe = lab.experiment,
    before = lab.before,
    after = lab.after,
    it = lab.test,
    expect = Code.expect;

var Hapi = require('hapi'),
    nock = require('nock'),
    config = require('../../config'),
    couchDB = require('../../adapters/couchDB'),
    couchConfig = config.couch,
    couch = require('../../services/user'),
    metrics = require('../../adapters/metrics')(config.metrics);

var couchdb = require('../fixtures/fake-couch')(couchConfig),
    server;

before(function (done) {
  // configure couch
  couchDB.init(couchConfig);

  server = new Hapi.Server();
  server.connection({ host: 'localhost', port: '6110' });
  server.register([
    {
      register: couch,
      options: couchConfig
    }
  ], function () {
    server.start(done);
  });
});

describe('getting user info from couch', function () {
  it('successfully grabs a user', function (done) {
    server.methods.user.getUser('blah', function (er, user) {
      expect(er).to.not.exist();
      expect(user).to.exist();
      expect(user.name).to.equal('blah');
      done();
    });
  });

  it('fails if the user doesn\'t exist', function (done) {
    server.methods.user.getUser('boop', function (er, user) {
      expect(er).to.exist();
      expect(er.output.statusCode).to.equal(404);
      expect(user).to.not.exist();
      done();
    });
  });
});

describe('signing up a user', function () {
  it('successfully creates a new account', function (done) {
    server.methods.user.signupUser({
      name: 'boom',
      password: '12345',
      verify: '12345',
      email: 'boom@boom.com'
    }, function (er, user) {
      expect(er).to.not.exist();
      expect(user).to.exist();
      expect(user.name).to.equal('boom');
      done();
    });
  });
});

describe('the mailing list checkbox', function () {
  var body = {"id":"e17fe5d778","email":{"email":"boom@boom.com"},"merge_vars":null,"email_type":"html","double_optin":true,"update_existing":false,"replace_interests":true,"send_welcome":false,"apikey":process.env.MAILCHIMP_KEY};

  it('adds the user to the mailing list when checked', function (done) {
    var mailchimp = nock('https://us9.api.mailchimp.com')
      .post('/2.0/lists/subscribe.json', body)
      .reply(201, '');

    server.methods.user.signupUser({
      name: 'boom',
      password: '12345',
      verify: '12345',
      email: 'boom@boom.com',
      npmweekly: 'on'
    }, function (er, user) {
      expect(mailchimp.isDone()).to.be.true();
      done();
    });
  });

  it('does not add the user to the mailing list when unchecked', function (done) {
    var mailchimp = nock('https://us9.api.mailchimp.com')
      .post('/2.0/lists/subscribe.json')
      .reply(201, '');

    server.methods.user.signupUser({
      name: 'boom',
      password: '12345',
      verify: '12345',
      email: 'boom@boom.com'
    }, function (er, user) {
      expect(mailchimp.isDone()).to.be.false();
      done();
    });
  });
});

describe('saving a profile', function () {
  it('successfully saves a profile with proper inputs', function (done) {
    var user = {
      _id: 'blah',
      otherStuff: 'things'
    };

    server.methods.user.saveProfile(user, function (er, data) {
      expect(er).to.not.exist();
      expect(data).to.exist();
      expect(data.ok).to.equal('updated profile');
      done();
    });
  });
});

describe('changing a password', function () {
  it('successfully changes a password with the proper inputs', function (done) {
    server.methods.user.changePass({name: 'boom', password: '12345'}, function (er, data) {
      expect(er).to.not.exist();
      expect(data).to.exist();
      expect(data.name).to.equal('boom');
      done();
    })
  });
});

describe('changing email', function () {
  it('successfully changes a user\'s email address', function (done) {
    server.methods.user.changeEmail('boom', 'boom@boom.net', function (er) {
      expect(er).to.not.exist();
      done();
    });
  });
});

describe('setting and deleting sessions', function () {
  var request = {
    auth: {
      session: {
        set: function () {},
        clear: function () {}
      }
    },
    server: {
      app: {
        cache: {
          set: function (id, user, ttl, next) { return next(null); },
          drop: function (id, next) { return next(null); }
        }
      },
      methods: {
        user: {
          logoutUser: function (token, next) { return next(null); }
        },
        metrics: {
          addMetric: function () {}
        }
      }
    }
  }

  it('sets a session', function (done) {
    server.methods.user.setSession(request)({name: 'boom'}, function (er) {
      expect(er).to.be.null();
      done();
    });
  });

  it('deletes a session', function (done) {
    server.methods.user.delSession(request)({name: 'boom'}, function (er) {
      expect(er).to.be.null();
      done();
    })
  });
});

describe('logging in and out', function () {
  it('allows a user to log in with proper credentials', function (done) {
    server.methods.user.loginUser({name: 'boom', password: '12345'}, function (er, user) {
      expect(er).to.not.exist();
      expect(user).to.exist();
      expect(user.name).to.equal('boom');
      expect(user).to.contain('token');
      done();
    });
  });

  it('allows a user to log out', function (done) {
    server.methods.user.logoutUser('randomToken', function (er, data) {
      expect(er).to.not.exist();
      expect(data).to.exist();
      expect(data.statusCode).to.equal(200);
      done();
    });
  });
});
