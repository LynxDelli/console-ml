<h1><img src='http://sirmasolutions.com/images/ladybugSmall.png' /> How To Install:</h1>

<ul>
<li>You need to have Firebug installed on Firefox; </li>
<li>Go to project webpage - <a href='http://sirmasolutions.com/products/ml-firefox-console'>http://sirmasolutions.com/products/ml-firefox-console</a>
or go to official Firefox Plugin page - <a href='https://addons.mozilla.org/en-US/firefox/addon/marklogic-console-for-fireb/'>https://addons.mozilla.org/en-US/firefox/addon/marklogic-console-for-fireb/</a>
</li>
<li>Click the green button "Add to Firefox' and the plugin will start installing;</li>
<li>You will need to restart your Firefox after successful completion; </li>
<li>After the Firefox restart, click F9 to open ConsoleML </li>
<li>A new tab 'ConcoleML' will be visible in Firebug. Open it and click on the Log link to setup your log configuration. </li>
</ul>

![http://sirmasolutions.com/templates/sirmatemplate/images/mlConsole/screenshot1.png](http://sirmasolutions.com/templates/sirmatemplate/images/mlConsole/screenshot1.png)
# ![http://sirmasolutions.com/images/ladybugSmall.png](http://sirmasolutions.com/images/ladybugSmall.png) Buttons information: #

<p><img src='http://sirmasolutions.com/images/ladybugSmall.png' /> drop-down button gives you opportunity to save Entire log or just filtered log.</p>

<p><img src='http://sirmasolutions.com/images/ladybugSmall.png' /> drop-down button gives you opportunity to change how log is displayed.</p>

<p>The Clear button clears the buffered log messages. When clicked, only new messages will be displayed.</p>

<p>The Log drop-down lets you select a configured log, edit the selected log configuration, delete the selected log configuration, or create a new log configuration.</p>

<p>The Level+ button enables display of multiple classes of messages at once.</p>

<p>The Log levels pull down enables individual filters for each error class. For each enabled error class, a button appears to the right for that level (for example, licking on Info in the Log Levels drop-down will show an info button. Clicking the Info button shows all Informational messages.</p>

<p>Filter buttons (Finest, Finer, Fine, Debug, Config, Info , Warning, Notice, Error, Critical, Alert, Emergency). Clicking one will display only buffered messages of that type. These buttons are enabled or disabled using the Log levels drop-down.</p>

<p>View entire log - request whole log from server and render it. If log file is on local machine and its too big will display just last 1MB.</p>

<p>ConsoleML have build-in search within visible log - next match, previous match, highlight all matches. You can find the search at the top right corner of the plugin</p>

# ![http://sirmasolutions.com/images/ladybugSmall.png](http://sirmasolutions.com/images/ladybugSmall.png) Setting up a log configuration: #

<p>The <b>Log name</b> is only meaningful to the user. It is not, for example, the name of the error log file.</p>

<p>Next to the Log path text box is a help icon (balloon with a question mark) that shows some example paths). Type the full path to the current log file (C:\Program Files\MarkLogic\Data\Logs\ErrorLog.txt for Windows).</p>

<p>The Log URL in the remote Log configuration identifies a REST endpoint that will return a text Log file (The built in endpoint invocation is (e.g.) HTTP://localhost:8001/get-error-log.xqy?filename=ErrorLog.txt. This is will read the local log file. Substitute your remote host for “localhost” to read a remote log file.</p>

<p>Since ConsoleML will only show messages posted to the log since the plug-in was started (or since the clear button was clicked), it won’t work for log files that aren’t changing (like ErrorLog_1.txt).</p>