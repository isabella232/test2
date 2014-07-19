#ifndef {{ cppClassName.toUpperCase() }}_H
#define {{ cppClassName.toUpperCase() }}_H

#include <nan.h>
#include <string>

extern "C" {
#include <git2.h>
}

//{%each dependencies as dependency%}
#include "<%- dependencies[d] %>"
//{%endeach%}

<% if (typeof forwardDeclare !== "undefined") { %>
// Forward declaration.
struct <%- cType %> {
  <% if (typeof fields != 'undefined') { %>
  <%
    for (var i in fields) {
      var fieldInfo = fields[i];
      if (fieldInfo.ignore || !fieldInfo.cppFunctionName) continue;
  -%>

      <%- fieldInfo.structType || fieldInfo.cType -%> <%- fieldInfo.structName || fieldInfo.name %>;
    <% } -%>
  <% } -%>

};
<% } -%>

using namespace node;
using namespace v8;

class <%- cppClassName %> : public ObjectWrap {
  public:

    static Persistent<Function> constructor_template;
    static void Initialize (Handle<v8::Object> target);

<% if (cType != undefined) { -%>
    <%- cType %> *GetValue();

    static Handle<Value> New(void *raw);
<% } -%>

  private:
<% if (cType != undefined) { -%>
    <%- cppClassName %>(<%- cType %> *raw);
    ~<%- cppClassName %>();
<% } -%>

    static NAN_METHOD(New);

<% if (typeof fields != 'undefined') { -%>
<%
  for (var i in fields) {
    var fieldInfo = fields[i];
    if (fieldInfo.ignore || !fieldInfo.cppFunctionName) continue;
-%>
    static NAN_METHOD(<%- fieldInfo.cppFunctionName %>);
<% } -%>
<% } -%>
<% if (typeof functions != 'undefined') { -%>
<%
  for (var i in functions) {
    var functionInfo = functions[i];
    if (functionInfo.ignore || !functionInfo.cppFunctionName) continue;
-%>
<% if (functionInfo.isAsync) { -%>

    struct <%- functionInfo.cppFunctionName %>Baton {
      int error_code;
      const git_error* error;
<%
  for (var i = 0; i < functionInfo.args.length; i++) {
    var arg = functionInfo.args[i];
-%>
<% if (arg.isReturn) { -%>
      <%- arg.cType.replace('**', '*') %> <%- arg.name %>;
<% } else { -%>
      <%- arg.cType %> <%- arg.name %>;
<% } -%>
<% } -%>
    };
    class <%- functionInfo.cppFunctionName %>Worker : public NanAsyncWorker {
      public:
        <%- functionInfo.cppFunctionName %>Worker(
            <%- functionInfo.cppFunctionName %>Baton *_baton,
            NanCallback *callback
        ) : NanAsyncWorker(callback)
          , baton(_baton) {};
        ~<%- functionInfo.cppFunctionName %>Worker() {};
        void Execute();
        void HandleOKCallback();

      private:
        <%- functionInfo.cppFunctionName %>Baton *baton;
    };
<% } -%>
    static NAN_METHOD(<%- functionInfo.cppFunctionName %>);
<% } -%>
<% } -%>
<% if (cType != undefined) { -%>
    <%- cType %> *raw;
<% } -%>
};

#endif

