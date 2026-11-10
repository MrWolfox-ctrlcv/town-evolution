import ctypes as c,json,sys,time,os,hashlib
E=c.CDLL('libEGL.so.1')
E.eglGetProcAddress.argtypes=[c.c_char_p];E.eglGetProcAddress.restype=c.c_void_p
P=c.c_void_p; I=c.c_int; U=c.c_uint

def fn(name,result,args):
 p=E.eglGetProcAddress(name.encode())
 if not p: raise RuntimeError('Missing EGL/GL entry point '+name)
 return c.CFUNCTYPE(result,*args)(p)
getdisplay=fn('eglGetPlatformDisplayEXT',P,[U,P,c.POINTER(I)])
display=getdisplay(0x31DD,None,None)
major=I();minor=I()
assert fn('eglInitialize',U,[P,c.POINTER(I),c.POINTER(I)])(display,c.byref(major),c.byref(minor)), 'eglInitialize failed'
assert fn('eglBindAPI',U,[U])(0x30A0),'eglBindAPI OpenGL ES failed'
attrs=(I*9)(0x3033,1,0x3040,4,0x3024,8,0x3025,0,0x3038)
config=P();count=I()
assert fn('eglChooseConfig',U,[P,c.POINTER(I),c.POINTER(P),I,c.POINTER(I)])(display,attrs,c.byref(config),1,c.byref(count)) and count.value, 'No pbuffer ES2 config'
ctx=fn('eglCreateContext',P,[P,P,P,c.POINTER(I)])(display,config,None,(I*3)(0x3098,2,0x3038))
assert ctx,'eglCreateContext failed'
surf=fn('eglCreatePbufferSurface',P,[P,P,c.POINTER(I)])(display,config,(I*5)(0x3057,1,0x3056,1,0x3038))
assert surf,'eglCreatePbufferSurface failed'
assert fn('eglMakeCurrent',U,[P,P,P,P])(display,surf,surf,ctx), 'eglMakeCurrent failed'
string=fn('glGetString',c.c_char_p,[U])
info={k:string(v).decode() for k,v in {'version':0x1F02,'renderer':0x1F01,'vendor':0x1F00,'shadingLanguage':0x8B8C,'extensions':0x1F03}.items()}
shadercreate=fn('glCreateShader',U,[U]); shadersource=fn('glShaderSource',None,[U,I,c.POINTER(c.c_char_p),c.POINTER(I)]);shadercompile=fn('glCompileShader',None,[U]);shaderstatus=fn('glGetShaderiv',None,[U,U,c.POINTER(I)]);shaderlog=fn('glGetShaderInfoLog',None,[U,I,c.POINTER(I),c.c_void_p]);shaderdelete=fn('glDeleteShader',None,[U])
programcreate=fn('glCreateProgram',U,[]);attach=fn('glAttachShader',None,[U,U]);programlink=fn('glLinkProgram',None,[U]);programstatus=fn('glGetProgramiv',None,[U,U,c.POINTER(I)]);programlog=fn('glGetProgramInfoLog',None,[U,I,c.POINTER(I),c.c_void_p]);programdelete=fn('glDeleteProgram',None,[U])
def inspect(id,status,log,flag):
 ok=I();status(id,flag,c.byref(ok));size=I();status(id,0x8B84,c.byref(size));buf=c.create_string_buffer(max(1,size.value));log(id,len(buf),None,buf)
 return {'id':id,'status':bool(ok.value),'log':buf.value.decode()}
for line in sys.stdin:
 try:
  q=json.loads(line);method=q['method'];a=q.get('args',[]);start=time.perf_counter()
  if method=='info':result=info
  elif method=='provenance':
   files={os.path.realpath(sys.executable)}
   with open('/proc/self/maps') as maps:
    for mapping in maps:
     parts=mapping.split()
     if len(parts)>5 and parts[-1].startswith('/') and os.path.isfile(parts[-1]): files.add(parts[-1])
   records=[]
   for file in sorted(files):
    with open(file,'rb') as content: digest=hashlib.file_digest(content,'sha256').hexdigest()
    records.append({'name':os.path.basename(file),'sha256':digest})
   result={'python':sys.version,'files':records}
  elif method=='compile':
   shader=shadercreate(a[0]);source=c.c_char_p(a[1].encode());shadersource(shader,1,c.byref(source),None);shadercompile(shader);result=inspect(shader,shaderstatus,shaderlog,0x8B81)
  elif method=='link':
   program=programcreate()
   for shader in a[0]:attach(program,shader)
   programlink(program);result=inspect(program,programstatus,programlog,0x8B82)
  elif method=='deleteShader':shaderdelete(a[0]);result=True
  elif method=='deleteProgram':programdelete(a[0]);result=True
  elif method=='close':break
  else:raise RuntimeError(method)
  print(json.dumps({'result':result,'driverMs':(time.perf_counter()-start)*1000}),flush=True)
 except Exception as e:
  print(json.dumps({'error':str(e)}),flush=True)
