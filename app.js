var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var index = require('./routes/index');
var users = require('./routes/users');

var config = require('./config');
const Storage = require('@google-cloud/storage');
var lineReader = require('readline');

const admin = require('firebase-admin');
var serviceAccount = require("./Repo-List-6b5485b8be90.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

var db = admin.firestore();
var docRef = db.collection(config.FIRESTORE_COLLECTION_NAME);

var fs = require('fs');
var gcs = Storage({
  projectId: config.PROJECT_ID,
  keyFilename: './Repo-List-d1a785db39dc.json'
});

// Reference an existing bucket.
var bucket = gcs.bucket(config.BUCKET_NAME);
console.log('bucket:', bucket.name);

// List files filtered by prefix
const options = {
  prefix: 'gh_',
};
bucket.getFiles(options)
  .then(results => {
    const files = results[0];

    console.log('Files:');
    files.forEach(file => {
      console.log(file.name);
    });

    var failedLogData = fs.readFileSync('./failed.log', 'utf8');
    var failedLineNo = 0;
    if(failedLogData.length>0) {
    	failedLineNo = parseInt(failedLogData.split("\n")[0].split(":")[1]);
    	console.log('failed line no: ', failedLineNo);
    }
    fs.truncate("./failed.log", 0, function() {
    });

    var successLogData = fs.readFileSync('./success.log', 'utf8');
    var successLineNo = 0;
    if(successLogData.length>0) {
    	successLineNo = parseInt(successLogData.split("\n")[0].split(":")[1]);
    	console.log('success line no: ', successLineNo);
    }
    //var successLogStream = fs.createWriteStream("./success.log");
	

    if(failedLineNo === 0) {
    	failedLineNo = successLineNo;
    }

    var readStream =bucket.file(files[0].name).createReadStream();
	var interface = lineReader.createInterface({
	  input: readStream
	});

	var lineNo = 0, finishedNo = failedLineNo-1, totalLine = 0;
	var logged_failure = false;

	interface.on('line', function (line) {
		totalLine++;
		if(totalLine >= failedLineNo) {
			lineNo++;
			//console.log('---------------------'+lineNo+'--------------------');
			if(lineNo<=400) {
				var jsonObj = JSON.parse(line);
				docRef.doc('0-line'+totalLine).set(jsonObj)
			  	.then(() => { // Document created successfully.			  		
			  		finishedNo++;		  			
		  			console.log('success! ', finishedNo);
		  			//successLogStream = fs.createWriteStream("./success.log");
					//successLogStream.write('completed line:'+finishedNo+'\n');

					fs.truncate("./success.log", 0, function() {
					    fs.writeFile("./success.log", 'completed line:'+finishedNo+'\n', function (err) {
					        if (err) {
					            console.log("Error writing to success.log: " + err);
					        }
					    });
					});
				})
				.catch(err => {
					finishedNo++;
					console.log('failure! ', finishedNo + err);		
					if(!logged_failure) {
						logged_failure = true;
						var failureLogStream = fs.createWriteStream("./failed.log");
						failureLogStream.write('failed line:'+finishedNo+'\n');						
					}			
					interface.pause();
					interface.close();						
				});
			} else {
				interface.pause();
				setTimeout(function() {
			      // console.log('------------resume---------------');
			      lineNo = 0;
			      interface.resume();
			    },2000);
			}
		}
	});
  })
  .catch(err => {
  	console.error('ERROR:', err);
  });

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', index);
app.use('/users', users);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
