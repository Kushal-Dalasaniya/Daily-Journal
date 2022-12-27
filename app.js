require('dotenv').config();

const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const _ = require("lodash");
const mongoose=require('mongoose');
const session = require("express-session");
const passport=require("passport");
const passportLocalMongoose=require("passport-local-mongoose");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate=require("mongoose-findorcreate");
const { before } = require('lodash');

const app = express();


app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

app.use(session({ secret:process.env.SECRET , 
                resave: false, 
                saveUninitialized: false 
            }));
app.use(passport.initialize());
app.use(passport.session());



// mongoose.connect(process.env.DB_URL,{useNewUrlParser:true});

// When we use cyclic, we must first establish a mogodb connection before port listening.
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.DB_URL,{useNewUrlParser:true});
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
}

const blogSchema=new mongoose.Schema({
  title:{
      type:String,
      required:[true,"Empty title is not valid"]
  }, 
  contant:String,
});
const Fild=mongoose.model('fild',blogSchema);

const userSchema=new mongoose.Schema({
  email: String,
  password: String,
  googleId: String,
  blog:[blogSchema]
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User=new mongoose.model("User",userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user,done){
  done(null,user.id);
});

passport.deserializeUser(function(id,done){
  User.findById(id,function(err,user){
      done(err,user);
  });
});


passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:process.env.CALLBACK_URL,
  userProfileURL:process.env.USER_PROFILE_URL
},
function(accessToken, refreshToken, profile, cb) {
  console.log("----------------------------profile------------------------------");
  console.log(profile);
  User.findOrCreate({username:profile.emails[0].value, googleId: profile.id }, function (err, user) {
      console.log("----------------------------user------------------------------");
      console.log(user);
    return cb(err, user);
  });
}
));




app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile","email"] }));

app.get("/auth/google/daily-journal", 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect secrets.
    res.redirect("/myblog");
});





app.get("/",function(req,res){
  Fild.find({},function(err,arr){
    if(err) console.log(err);
    else{
      res.render("home",{title:"Home",arr:arr});
    }
  })
}) 

app.get("/Home/:Id",function(req,res){
  Fild.findById(req.params.Id,function(err,obj){
    if(err) console.log(err);
    else{
      res.render("post",{Title:obj.title,Contant:obj.contant,ID:req.params.Id,fromHome:true});
    }
  })
})

app.get("/login",function(req,res){ 
  res.render('logIn');
})

app.get("/signin",function(req,res){
  res.render('signIn',{errorMassge:null});
})



app.get("/posts/:Id",function(req,res){
  Fild.findById(req.params.Id,function(err,obj){
    if(err) console.log(err);
    else{
      res.render("post",{Title:obj.title,Contant:obj.contant,ID:req.params.Id,fromHome:false});
    }
  })
})


app.post("/posts/:Id",function(req,res){
  Fild.findByIdAndDelete(req.params.Id,function(err){
    if(err) console.log(err);
    else{
      User.findById(req.user.id,function(err,foundUser){
        if(err){
            console.log(err);
        }
        else{
            if(foundUser){
                  foundUser.blog = foundUser.blog.filter(element => { return element._id != req.params.Id});
                  foundUser.save();
                  res.redirect("/myblog");
                }
            }
      })
    }
  })
})


app.get("/update/:Id",function(req,res){
  Fild.findById(req.params.Id,function(err,obj){
    if(err) console.log(err);
    else{ 
      res.render("update",{Title:obj.title,Contant:obj.contant,ID:req.params.Id});
    }
  })
})


app.post("/update/:Id",function(req,res){
  Fild.findByIdAndUpdate(req.params.Id,{title:req.body.postTitle,contant:req.body.postBody},function(err){
    console.log(req.user.id);
    if(err) console.log(err);
    else{ 
      User.findById(req.user.id,function(err,foundUser){
        if(err){
            console.log(err);
        }
        else{
            if(foundUser){
                  foundUser.blog.forEach(element => {
                    if(element._id==req.params.Id){
                      element.title=req.body.postTitle
                      element.contant=req.body.postBody
                    }
                  });
                  foundUser.save();
                  res.redirect("/myblog");
                }
            }
      })
    }
  })
})


app.get("/compose",function(req,res){
  if(req.isAuthenticated()){
    res.render("compose");
  }
  else{
      res.redirect("/login");
  }
})

app.post("/compose",function(req,res){
  User.findById(req.user.id,function(err,foundUser){
    if(err){
        console.log(err);
    }
    else{
        if(foundUser){
            const obj=new Fild({
              title:req.body.postTitle,
              contant:req.body.postBody
            });
            obj.save();
            foundUser.blog.push(obj);
            foundUser.save(function(){
                res.redirect("/");
            })
        }
    }
  })
})


app.post("/register",function(req,res){
  User.register({username :req.body.username},req.body.password,function(err,user){
      if(err){
          console.log(err);
          res.render('signIn',{errorMassge:err.message});
      }
      else{
          passport.authenticate("local")(req,res,function(){
              res.redirect("/");
          })
      }
  })
});


app.post('/login', 
    passport.authenticate('local', { failureRedirect: '/signin' }),
    function(req, res) {
        res.redirect('/');
});


app.get("/myblog",function(req,res){
  if(req.isAuthenticated()){
    User.findById(req.user.id,function(err,foundUser){
      if(err){
          console.log(err);
      }
      else{
          if(foundUser){
            res.render("home",{title:"My Blogs",arr:foundUser.blog});
          }
      }
    })
  }
  else{
      res.redirect("/login");
  }
})


// app.listen(process.env.PORT||3000, function() {
//   console.log("Server started on port "+process.env.PORT);
// });

// When we use cyclic, we must first establish a mogodb connection before port listening.
connectDB().then(() => {
  app.listen(process.env.PORT||3000, function() {
    console.log("Server started on port "+process.env.PORT);
  });
})
