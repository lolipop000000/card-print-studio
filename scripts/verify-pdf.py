"""Check actual PDF page sizes, raster resolution and card image placements."""
import argparse, json, math
from pypdf import PdfReader
from pypdf.generic import ContentStream
parser=argparse.ArgumentParser();parser.add_argument("file");parser.add_argument("--pages",type=int,default=4);parser.add_argument("--width",type=float,default=210);parser.add_argument("--height",type=float,default=297)
args=parser.parse_args();reader=PdfReader(args.file)
assert len(reader.pages)==args.pages,(len(reader.pages),args.pages)
mm=25.4/72
def multiply(a,b):
 return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]
placements=[]
for page in reader.pages:
 assert abs(float(page.mediabox.width)-args.width/mm)<.02
 assert abs(float(page.mediabox.height)-args.height/mm)<.02
 matrix=[1,0,0,1,0,0];stack=[];cards=[]
 images=page["/Resources"].get("/XObject",{})
 for op,command in ContentStream(page.get_contents(),reader).operations:
  if command==b"q":stack.append(matrix[:])
  elif command==b"Q":matrix=stack.pop()
  elif command==b"cm":matrix=multiply(matrix,[float(v) for v in op])
  elif command==b"Do":
   obj=images[op[0]].get_object()
   if obj.get("/Subtype")!="/Image":continue
   w,h=math.hypot(matrix[0],matrix[1])*mm,math.hypot(matrix[2],matrix[3])*mm
   assert abs(w-63)<.02 and abs(h-88)<.02,(w,h)
   assert int(obj["/Width"])==744 and int(obj["/Height"])==1039
   cards.append({"x":matrix[4]*mm,"y":args.height-(matrix[5]*mm+h),"w":w,"h":h})
 placements.append(cards)
if args.pages==4:
 assert [len(p) for p in placements]==[9,9,1,1]
 for a,b in [(placements[0],placements[1]),(placements[2],placements[3])]:
  for front,back in zip(a,b):
   assert abs(back["x"]-(args.width-front["x"]-63))<.02
   assert abs(back["y"]-front["y"])<.02
 assert reader.metadata.subject=="front,back,front,back"
print(json.dumps({"status":"PASS","pages":len(reader.pages),"sizeMm":[args.width,args.height],"cardsPerPage":[len(p) for p in placements],"placementsMm":placements},ensure_ascii=False,indent=2))
