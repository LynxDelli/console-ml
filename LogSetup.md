# ![http://sirmasolutions.com/images/ladybugSmall.png](http://sirmasolutions.com/images/ladybugSmall.png) Setting up a log configuration: #

<p>The <b>Log name</b> is only meaningful to the user. It is not, for example, the name of the error log file.</p>

<p>Next to the Log path text box is a help icon (balloon with a question mark) that shows some example paths). Type the full path to the current log file (C:\Program Files\MarkLogic\Data\Logs\ErrorLog.txt for Windows).</p>

<p>The Log URL in the remote Log configuration identifies a REST endpoint that will return a text Log file (The built in endpoint invocation is (e.g.) HTTP://localhost:8001/get-error-log.xqy?filename=ErrorLog.txt. This is will read the local log file. Substitute your remote host for “localhost” to read a remote log file.</p>

<p>Since ConsoleML will only show messages posted to the log since the plug-in was started (or since the clear button was clicked), it won’t work for log files that aren’t changing (like ErrorLog_1.txt).</p>